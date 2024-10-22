import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as iam from 'aws-cdk-lib/aws-iam';

export class KeycloakFargateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'KeycloakVpc', {
      maxAzs: 2
    });

    // MySQL Credentials stored in Secrets Manager
    const dbCredentials = new secretsmanager.Secret(this, 'DBCredentials', {
      secretName: 'KeycloakDBCredentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'keycloak',
        }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\',
      }
    });

    // RDS MySQL Instance
    const mysql = new rds.DatabaseInstance(this, 'KeycloakMySQL', {
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_5_7 }),
      vpc,
      credentials: rds.Credentials.fromSecret(dbCredentials),
      databaseName: 'keycloak',
      allocatedStorage: 20,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.SMALL),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      multiAz: false,
      publiclyAccessible: true,
    });

    // Fargate Cluster
    const cluster = new ecs.Cluster(this, 'KeycloakCluster', {
      vpc,
    });

    // Fargate Task Definition for Keycloak
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'KeycloakTaskDef');

    // Add container for Keycloak
    const keycloakContainer = taskDefinition.addContainer('KeycloakContainer', {
      image: ecs.ContainerImage.fromRegistry('quay.io/keycloak/keycloak:latest'),
      logging: new ecs.AwsLogDriver({ streamPrefix: 'Keycloak' }),
      environment: {
        'KC_DB': 'mysql',
        'KC_DB_URL': `jdbc:mysql://${mysql.dbInstanceEndpointAddress}/keycloak`,
        'KC_DB_USERNAME': dbCredentials.secretValueFromJson('username').toString(),
        'KC_DB_PASSWORD': dbCredentials.secretValueFromJson('password').toString(),
        'KC_HTTP_PORT': '8080',
        'KC_HOSTNAME': 'localhost',
        'KEYCLOAK_ADMIN': 'admin',
        'KEYCLOAK_ADMIN_PASSWORD': 'admin',
        'KC_FEATURES': 'scripts',
      },
      portMappings: [{ containerPort: 8080 }]
    });

    // Fargate Service
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'KeycloakService', {
      cluster,
      taskDefinition,
      publicLoadBalancer: true,
      listenerPort: 80,
      desiredCount: 1
    });

    // Grant RDS permissions
    mysql.grantConnect(fargateService.taskDefinition.taskRole);

    // Define IAM Role for the Fargate Task
    const taskRole = new iam.Role(this, 'KeycloakTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Attach necessary policies to the IAM role
    taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'));
    taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonRDSFullAccess'));
    taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryFullAccess'));
    taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'));
    taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite'));

    // Attach the IAM role to the task definition
    taskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({
      actions: [
        'secretsmanager:GetSecretValue',
        'rds-db:connect',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: [dbCredentials.secretArn, mysql.instanceArn],
    }));

    // Assign taskRole to the taskDefinition
    taskDefinition.taskRole = taskRole;

    // Allow the ECS task to pull from ECR
    taskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:BatchCheckLayerAvailability"
      ],
      resources: ["*"]
    }));

    // Allow the ECS task to connect to MySQL RDS
    mysql.connections.allowDefaultPortFrom(fargateService.service);

    // Output the Load Balancer DNS Name
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: fargateService.loadBalancer.loadBalancerDnsName
    });
  }
}
