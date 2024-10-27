import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class IamStack extends Stack {
  public readonly ecsTaskExecutionRole: iam.Role;
  public readonly lambdaExecutionRole: iam.Role;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // DevOps IAM Group with required managed policies
    const devOpsGroup = new iam.Group(this, 'DevOpsGroup', {
      groupName: 'DevOpsGroup',
    });

    const managedPolicies = [
      'AmazonEC2ContainerRegistryFullAccess',
      'AmazonEC2ContainerRegistryPowerUser',
      'AmazonECS_FullAccess',
      'service-role/AmazonECSTaskExecutionRolePolicy',
      'AWSCodeBuildAdminAccess',
      'AWSCodeBuildDeveloperAccess',
      'AWSCodePipeline_FullAccess',
      'SecretsManagerReadWrite',
    ];

    managedPolicies.forEach(policyName => {
      devOpsGroup.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName(policyName));
    });

    const devOpsUser = new iam.User(this, 'DevOpsUser', { userName: 'devops-user' });
    devOpsGroup.addUser(devOpsUser);

    // ECS Task Role
    const ecsTaskRole = new iam.Role(this, 'EcsTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'IAM Role for ECS tasks to interact with AWS services',
      roleName: 'EcsTaskRole',
    });

    // Policy for ECS tasks requiring EC2 and CloudFormation access
    ecsTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ec2:CreateNetworkInterface', 'ec2:DeleteNetworkInterface', 'ec2:DescribeNetworkInterfaces',
        'ec2:DescribeSecurityGroups', 'ec2:DescribeSubnets', 'ec2:DescribeVpcs',
        'cloudformation:CreateStack', 'cloudformation:DeleteStack', 'cloudformation:DescribeStacks', 'cloudformation:UpdateStack'
      ],
      resources: ['*'],
    }));

    // S3 access policy for ECS tasks
    ecsTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:GetObject', 's3:ListBucket', 's3:DeleteObject'],
      resources: ['arn:aws:s3:::*'],
    }));

    // Elastic Load Balancing permissions
    ecsTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'elasticloadbalancing:DescribeLoadBalancers', 'elasticloadbalancing:DescribeTargetGroups',
        'elasticloadbalancing:RegisterTargets', 'elasticloadbalancing:DeregisterTargets', 'elasticloadbalancing:DescribeTargetHealth',
      ],
      resources: ['*'],
    }));

    // CloudWatch Logs permissions
    ecsTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams', 'logs:GetLogEvents', 'logs:FilterLogEvents'],
      resources: ['arn:aws:logs:*:*:log-group:*'],
    }));

    // Secrets Manager access for CodePipeline and CodeBuild
    const secretArn = 'arn:aws:secretsmanager:us-east-1:640168451108:secret:skillshift-FwpAfj';
    const pipelineRole = new iam.Role(this, 'CodePipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });
    pipelineRole.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [secretArn],
    }));

    const codeBuildRole = new iam.Role(this, 'CodeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });
    codeBuildRole.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [secretArn],
    }));

    // CodeBuild Role ECR permissions
    codeBuildRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecr:GetAuthorizationToken', 'ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage',
        'ecr:PutImage', 'ecr:InitiateLayerUpload', 'ecr:UploadLayerPart', 'ecr:CompleteLayerUpload', 'ecr:ListImages'
      ],
      resources: ['*'],
    }));

    // ECS Task Execution Role for pulling images, networking, and logging
    this.ecsTaskExecutionRole = new iam.Role(this, 'SMTaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'IAM Role for ECS tasks to interact with AWS services',
      roleName: 'SMTaskExecutionRole',
    });

    // Task Execution Role permissions, including ECR and EC2 for networking
    const ecsExecutionPolicy = new iam.Policy(this, 'EcsExecutionPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: [
            'ecr:GetAuthorizationToken', 'ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage', 'ecr:ListImages',
            'ec2:CreateNetworkInterface', 'ec2:DescribeNetworkInterfaces', 'ec2:DeleteNetworkInterface',
            'ec2:DescribeSecurityGroups', 'ec2:DescribeSubnets', 'ec2:DescribeVpcs',
            'logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams', 'logs:GetLogEvents', 'logs:FilterLogEvents',
            'elasticloadbalancing:DescribeLoadBalancers', 'elasticloadbalancing:DescribeTargetGroups',
            'elasticloadbalancing:RegisterTargets', 'elasticloadbalancing:DeregisterTargets', 'elasticloadbalancing:DescribeTargetHealth',
            's3:PutObject', 's3:GetObject', 's3:ListBucket', 's3:DeleteObject'
          ],
          resources: ['*'],
        }),
      ],
    });

    this.ecsTaskExecutionRole.attachInlinePolicy(ecsExecutionPolicy);


    // Lambda Execution Role with EC2 permissions for network interfaces
    this.lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM Role for Lambda to create network interfaces within a VPC',
    });

    this.lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeVpcs"
      ],
      resources: ["*"],
    }));
    // Output the ECS Task Role ARN for easy reference
    new cdk.CfnOutput(this, 'EcsTaskRoleArn', {
      value: ecsTaskRole.roleArn,
      description: 'The ARN of the ECS Task Role',
    });

    // Output the Lambda Execution Role ARN for easy reference
    new cdk.CfnOutput(this, 'LambdaExecutionRoleArn', {
      value: this.lambdaExecutionRole.roleArn,
      description: 'The ARN of the Lambda Execution Role',
    });
  }
}
