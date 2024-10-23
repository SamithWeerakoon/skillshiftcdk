import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface FargateServiceStackProps extends StackProps {
  repository: Repository; // Optional: if you still want to pass a repository object
}

export class FargateServiceStack extends Stack {
  // Expose the service object to be accessed by the pipeline
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: FargateServiceStackProps) {
    super(scope, id, props);

    // Import VPC, Cluster, and Public Subnets from the NetworkStack
    const vpcId = cdk.Fn.importValue('SkillShiftVpcId');
    const clusterName = cdk.Fn.importValue('SkillShiftClusterName');
    const publicSubnet1Id = cdk.Fn.importValue('PublicSubnet1Id');
    const publicSubnet2Id = cdk.Fn.importValue('PublicSubnet2Id');

    // Import VPC from NetworkStack using the exported values
    const vpc = Vpc.fromVpcAttributes(this, 'ImportedVpc', {
      vpcId: vpcId,
      availabilityZones: ['us-east-1a', 'us-east-1b'],  // Adjust as needed
      publicSubnetIds: [publicSubnet1Id, publicSubnet2Id],
    });

    // Import ECS Cluster from NetworkStack
    const cluster = Cluster.fromClusterAttributes(this, 'ImportedCluster', {
      clusterName: clusterName,
      vpc: vpc,
    });

    // Retrieve environment variables from SSM Parameter Store
    const apiBaseUrl = ssm.StringParameter.valueFromLookup(this, '/your-app/production/NEXT_PUBLIC_API_BASE_URL');
    const secretKey = ssm.StringParameter.valueFromLookup(this, '/your-app/production/SECRET_KEY');

    // Create a unique log group for the Fargate service to store container logs
    const logGroup = new logs.LogGroup(this, `FargateServiceLogGroup-${id}`, {  
      retention: logs.RetentionDays.ONE_WEEK,  // Customize retention as needed
      removalPolicy: cdk.RemovalPolicy.DESTROY,  // Remove logs when the stack is destroyed
    });

    // Define the Fargate service with CloudWatch logging enabled
    const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, `FargateService-${id}`, {
      cluster,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry('640168451108.dkr.ecr.us-east-1.amazonaws.com/skill-shift:668f323d740369beb243f22fd87c9c9db6ab9cf8'), // Use full ECR image URI
        containerPort: 3000, // Set the container port to 3000 for Next.js
        environment: {
          NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
          SECRET_KEY: secretKey,
        },
        // Enable CloudWatch Logs for the container
        logDriver: new ecs.AwsLogDriver({
          streamPrefix: 'FargateService',
          logGroup: logGroup,  // Attach the log group to the container
        }),
      },
      desiredCount: 1,
      publicLoadBalancer: true,  // Make the load balancer publicly accessible
      listenerPort: 80, // The load balancer listens on port 80 and routes to container port 3000
      healthCheckGracePeriod: cdk.Duration.seconds(60), // Give service some time to start up
    });

    // Add Health Check for the Load Balancer
    fargateService.targetGroup.configureHealthCheck({
      path: '/api/health',  // Path to your health check endpoint in Next.js
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyHttpCodes: '200',  // Consider 200 as healthy
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
    });

    // Assign the Fargate service to the public property
    this.service = fargateService.service; // This will allow us to use the service in the pipeline

    // Output the Fargate service information for debugging purposes
    new cdk.CfnOutput(this, 'FargateServiceDNS', {
      value: fargateService.loadBalancer.loadBalancerDnsName,
      description: 'DNS name of the Load Balancer',
    });

    new cdk.CfnOutput(this, 'FargateServiceLogGroup', {
      value: logGroup.logGroupName,
      description: 'CloudWatch Log Group for Fargate Service',
    });
  }
}
