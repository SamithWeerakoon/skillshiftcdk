import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import * as logs from 'aws-cdk-lib/aws-logs';
import { ICluster } from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam'; // Import IAM for roles
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'; // Import ALB

export interface FargateServiceStackProps extends StackProps {
  repository: Repository; // Optional if you want to pass the ECR repository object
  cluster: ICluster;      // The ECS Cluster where the service will run
  taskExecutionRole: iam.IRole;
}

export class FargateServiceStack extends Stack {
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: FargateServiceStackProps) {
    super(scope, id, props);

    // Retrieve environment variables from SSM Parameter Store
    const apiBaseUrl = ssm.StringParameter.valueFromLookup(this, 'NEXT_PUBLIC_API_BASE_URL');
    const secretKey = ssm.StringParameter.valueFromLookup(this, 'SECRET_KEY');

    // Create a unique log group for the Fargate service to store container logs
    const logGroup = new logs.LogGroup(this, `FargateServiceLogGroup-${id}`, {
      retention: logs.RetentionDays.ONE_WEEK,  // Retain logs for one week
      removalPolicy: cdk.RemovalPolicy.DESTROY,  // Remove logs when the stack is destroyed
    });

    // Define the Fargate task definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, `FargateTaskDefinition-${id}`, {
      memoryLimitMiB: 512,  // Adjust memory as needed
      cpu: 256,  // Adjust CPU as needed
      executionRole: props.taskExecutionRole,
      taskRole: props.taskExecutionRole,
    });

    // Add the container to the task
    taskDefinition.addContainer('AppContainer', {
      image: ecs.ContainerImage.fromRegistry('640168451108.dkr.ecr.us-east-1.amazonaws.com/skill-shift:latest'), // Full ECR image URI
      environment: {
        NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
        SECRET_KEY: secretKey,
      },
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'FargateService',  // Log stream prefix in CloudWatch
        logGroup: logGroup,  // Log group created earlier
      }),
      portMappings: [{ containerPort: 3000 }]  // Map container port for your application
    });

    // Create Fargate service in the private subnet
    const fargateService = new ecs.FargateService(this, `FargateService-${id}`, {
      cluster: props.cluster,  // ECS Cluster
      taskDefinition,  // Fargate task definition
      desiredCount: 1,  // Number of tasks to run
    });

    // Create a security group for the ALB
    const albSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc: props.cluster.vpc,
      description: 'Allow HTTP traffic to ALB',
      allowAllOutbound: true,  // ALB will send traffic to targets
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic from anywhere');

    // Create an Application Load Balancer (ALB) in the public subnet
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'FargateALB', {
      vpc: props.cluster.vpc,
      internetFacing: true,  // Make the ALB internet-facing
      securityGroup: albSecurityGroup,
    });

    // Add listener for HTTP (port 80)
    const listener = loadBalancer.addListener('PublicListener', {
      port: 80,
      open: true,
    });

    // Attach the Fargate service to the ALB
    listener.addTargets('FargateTarget', {
      port: 80,  // Forward traffic from ALB to Fargate service on port 3000
      targets: [fargateService],
      healthCheck: {
        path: '/api/health',  // Health check endpoint for the service
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
      },
    });

    // Assign the Fargate service and ALB to public properties
    this.service = fargateService;
    this.loadBalancer = loadBalancer;

    // Output the ALB DNS name for access
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: loadBalancer.loadBalancerDnsName,
      description: 'DNS name of the ALB',
    });

    // Output the CloudWatch Log Group name for debugging purposes
    new cdk.CfnOutput(this, 'FargateServiceLogGroup', {
      value: logGroup.logGroupName,
      description: 'CloudWatch Log Group for Fargate Service',
    });
  }
}
