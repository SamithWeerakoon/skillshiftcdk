import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Repository } from 'aws-cdk-lib/aws-ecr';

export interface FargateServiceStackProps extends StackProps {
  repository: Repository;
}

export class FargateServiceStack extends Stack {
  // Expose the service object to be accessed by the pipeline
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: FargateServiceStackProps) {
    super(scope, id, props);

    // Create a VPC
    const vpc = new ec2.Vpc(this, 'SkillShiftVpc', { maxAzs: 2 });

    // Create an ECS Cluster
    const cluster = new ecs.Cluster(this, 'SkillShiftCluster', { vpc });

    // Retrieve environment variables from SSM Parameter Store
    const apiBaseUrl = ssm.StringParameter.valueFromLookup(this, '/your-app/production/NEXT_PUBLIC_API_BASE_URL');
    const secretKey = ssm.StringParameter.valueFromLookup(this, '/your-app/production/SECRET_KEY');

    // Define the Fargate service
    const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'FargateService', {
      cluster,
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(props.repository, 'latest'),
        environment: {
          NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
          SECRET_KEY: secretKey,
        },
      },
      desiredCount: 1,
    });

    // Assign the Fargate service to the public property
    this.service = fargateService.service; // This will allow us to use the service in the pipeline
  }
}
