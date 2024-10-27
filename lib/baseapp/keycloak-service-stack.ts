import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import * as logs from 'aws-cdk-lib/aws-logs';
import { ICluster } from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';

export interface KeycloakServiceStackProps extends StackProps {
  repository: Repository;
  cluster: ICluster;
  taskExecutionRole: iam.IRole;
}

export class KeycloakServiceStack extends Stack {
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: KeycloakServiceStackProps) {
    super(scope, id, props);

    const logGroup = new logs.LogGroup(this, `KeycloakServiceLogGroup-${id}`, {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, `KeycloakTaskDefinition-${id}`, {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole: props.taskExecutionRole,
      taskRole: props.taskExecutionRole,
    });

    taskDefinition.addContainer('KeycloakContainer', {
      image: ecs.ContainerImage.fromRegistry('quay.io/keycloak/keycloak:latest'),
      environment: {
        KEYCLOAK_ADMIN: 'admin',
        KEYCLOAK_ADMIN_PASSWORD: 'admin',
      },
      command: ['start-dev'],
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'KeycloakService',
        logGroup: logGroup,
      }),
      portMappings: [{ containerPort: 8080 }],
    });

    const keycloakService = new ecs.FargateService(this, `KeycloakService-${id}`, {
      cluster: props.cluster,
      taskDefinition,
      desiredCount: 1,
    });

    const albSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc: props.cluster.vpc,
      description: 'Allow HTTP traffic to ALB on port 80 only',
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic on port 80');

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'KeycloakALB', {
      vpc: props.cluster.vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });

    const listener = loadBalancer.addListener('PublicListener', {
      port: 80,  // Update the listener to listen on port 80
      open: true,
    });

    listener.addTargets('KeycloakTarget', {
      port: 80,  // Forward traffic to the container's port 8080
      targets: [keycloakService],
      healthCheck: {
        path: '/realms/master/.well-known/openid-configuration',
        interval: cdk.Duration.seconds(90),
        timeout: cdk.Duration.seconds(30),
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    this.service = keycloakService;
    this.loadBalancer = loadBalancer;

    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: loadBalancer.loadBalancerDnsName,
      description: 'DNS name of the ALB',
    });
  }
}
