#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcrStack } from '../lib/baseapp/ecr-stack';
import { SsmParametersStack } from '../lib/baseapp/ssm-parameters-stack';
import { FargateServiceStack } from '../lib/baseapp/fargate-service-stack';
import { PipelineStack } from '../lib/baseapp/pipeline-stack';
import { KeycloakFargateStack } from '../lib/baseapp/KeycloakFargateStack';
import { NetworkStack } from '../lib/baseapp/network';
import { ClusterStack } from '../lib/baseapp/cluster';
import { IamStack } from '../lib/baseapp/iam-stack';
// Define environment configuration for your AWS account and region
// const env = {
//   account: process.env.CDK_DEFAULT_ACCOUNT,  // Automatically fetch account from environment
//   region: process.env.CDK_DEFAULT_REGION     // Automatically fetch region from environment
// };

// Alternatively, you can hardcode the account and region if needed
const env = {
  account: '640168451108',  // Replace with your actual AWS account ID
  region: 'us-east-1',      // Replace with your preferred AWS region
};

const app = new cdk.App();

// Instantiate ECR Stack with environment configuration
const ecrStack = new EcrStack(app, 'EcrStack', { env });

// Instantiate SSM Parameter Store Stack with environment configuration
const ssmParametersStack = new SsmParametersStack(app, 'SsmParametersStack', { env });



// Instantiate Pipeline Stack and pass Fargate service along with environment configuration
new PipelineStack(app, 'PipelineStack', {
  repository: ecrStack.repository,
  // fargateServiceStack: fargateServiceStack,
  env,  // Pass environment configuration here
});

// Optionally, if you have an IAM stack for managing permissions
const ecsTaskExecutionRole = new IamStack(app, 'IamStack', { env });

// const networkStack = new NetworkStack(app, 'NetworkStack');

const networkStack = new NetworkStack(
  app,
  'NetworkStack',{
    stackProps: { env }}
);

const clusterStack = new ClusterStack(app, 'skillappClusterStack', {
  stackProps: { env },
  vpc: networkStack.vpc,
});

// // Pass the VPC and Cluster to the Keycloak Fargate stack
// new KeycloakFargateStack(app, 'KeycloakFargateStack', {
//   vpc: networkStack.vpc,
//   cluster: networkStack.cluster,
// });

const ecs= ecsTaskExecutionRole.ecsTaskExecutionRole.withoutPolicyUpdates();

// Instantiate Fargate Service Stack with environment configuration
const fargateServiceStack = new FargateServiceStack(app, 'FargateServiceStack', {
  repository: ecrStack.repository,
  cluster : clusterStack.cluster,
  taskExecutionRole: ecs,
  env, // Pass environment configuration here
});
