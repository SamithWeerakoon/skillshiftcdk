import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as iam from 'aws-cdk-lib/aws-iam';

interface KeycloakFargateStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  cluster: ecs.Cluster;
}

export class KeycloakFargateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: KeycloakFargateStackProps) {
    super(scope, id, props);

    const { vpc, cluster } = props;  // Access vpc and cluster from props

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

    // Fargate Task Definition for Keycloak with taskRole attached
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'KeycloakTaskDef', {
      taskRole, // Assign the role here during creation
    });

    // Add container for Keycloak
    const keycloakContainer = taskDefinition.addContainer('KeycloakContainer', {
      image: ecs.ContainerImage.fromRegistry('quay.io/keycloak/keycloak:latest'),
      logging: new ecs.AwsLogDriver({ streamPrefix: 'Keycloak' }),
      environment: {
        'KC_DB': 'mysql',
        'KC_DB_URL': `jdbc:mysql://${mysql.dbInstanceEndpointAddress}/keycloak`,
        'KC_HTTP_PORT': '8080',
        'KC_HOSTNAME': 'localhost',
        'KEYCLOAK_ADMIN': 'admin',
        'KEYCLOAK_ADMIN_PASSWORD': 'admin',
        'KC_FEATURES': 'scripts',
      },
      secrets: {
        // Pass secrets securely using Secrets Manager
        'KC_DB_USERNAME': ecs.Secret.fromSecretsManager(dbCredentials, 'username'),
        'KC_DB_PASSWORD': ecs.Secret.fromSecretsManager(dbCredentials, 'password'),
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
