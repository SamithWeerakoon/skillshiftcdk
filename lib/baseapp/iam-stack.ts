import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class IamStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create an IAM group for DevOps users
    const devOpsGroup = new iam.Group(this, 'DevOpsGroup', {
      groupName: 'DevOpsGroup', // Optional: Set a custom group name
    });

    // Attach managed policies to the DevOps group for required access
    const managedPolicies = [
      'AmazonEC2ContainerRegistryFullAccess',
      'AmazonEC2ContainerRegistryPowerUser',
      'AmazonECS_FullAccess',
      'service-role/AmazonECSTaskExecutionRolePolicy', // Adjusted name for ECS task execution policy
      'AWSCodeBuildAdminAccess',
      'AWSCodeBuildDeveloperAccess',
      'AWSCodePipeline_FullAccess',
      'SecretsManagerReadWrite',
    ];

    // Add managed policies to the DevOps group
    managedPolicies.forEach(policyName => {
      devOpsGroup.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName(policyName));
    });

    // Create an IAM User and assign them to the DevOps group
    const devOpsUser = new iam.User(this, 'DevOpsUser', {
      userName: 'devops-user', // Optional: Specify the user name
    });

    // Add the user to the DevOps group
    devOpsGroup.addUser(devOpsUser);

    // Create an IAM Role for ECS Fargate or EC2 tasks
    const ecsTaskRole = new iam.Role(this, 'EcsTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'IAM Role for ECS tasks to interact with AWS services',
      roleName: 'EcsTaskRole', // Optional: Set a custom role name
    });

    // Add inline policy to allow the ECS task to access specific S3 resources
    ecsTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject', 's3:GetObject', 's3:ListBucket','s3:DeleteObject'],
        resources: ['arn:aws:s3:::*'],
      })
    );

    // Allow CodePipeline and CodeBuild to retrieve GitHub token from Secrets Manager
    const secretArn = 'arn:aws:secretsmanager:us-east-1:967083126936:secret:skillshift-yTrlCf';
    const pipelineRole = new iam.Role(this, 'CodePipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });
    
    // Add Secrets Manager access policy for GitHub token
    pipelineRole.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [secretArn],
    }));

    const codeBuildRole = new iam.Role(this, 'CodeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    // Add Secrets Manager access policy to CodeBuild
    codeBuildRole.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [secretArn],
    }));
    

    // Output the ECS Task Role ARN for easy reference
    new cdk.CfnOutput(this, 'EcsTaskRoleArn', {
      value: ecsTaskRole.roleArn,
      description: 'The ARN of the ECS Task Role',
    });
    
  }
}