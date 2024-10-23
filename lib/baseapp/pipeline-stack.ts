import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface PipelineStackProps extends StackProps {
  repository: Repository;
}

export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    // CloudWatch Log Group for CodeBuild
    const logGroup = new logs.LogGroup(this, 'CodeBuildLogGroup', {
      logGroupName: `/aws/codebuild/NextJsPipeline`,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Clean up when stack is destroyed
      retention: logs.RetentionDays.ONE_WEEK,   // Adjust retention based on need
    });

    // Create a CodeBuild project for building Docker images with CloudWatch logging
    const codeBuildProject = new codebuild.PipelineProject(this, 'CodeBuildProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true, // Required to run Docker
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
      logging: {
        cloudWatch: {
          logGroup: logGroup,
        },
      },
    });

    // Create CodePipeline
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'NextJsPipeline',
    });

    // Source Stage
    const sourceOutput = new codepipeline.Artifact();
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeStarConnectionsSourceAction({
          actionName: 'GitHub_Source',
          owner: 'SamithWeerakoon',       // GitHub username
          repo: 'skillshiftapp',           // Repository name
          connectionArn: 'arn:aws:codeconnections:us-east-1:640168451108:connection/922e934a-c857-41b6-a3af-ed8e48bef72f', // Use your existing CodeStar connection ARN
          output: sourceOutput,
          branch: 'main',                  // Branch to track
        }),
      ],
    });

    // Build Stage
    const buildOutput = new codepipeline.Artifact();
    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Build',
          project: codeBuildProject,
          input: sourceOutput,
          outputs: [buildOutput],
        }),
      ],
    });

    // No Deploy Stage here, only the build process is retained
  }
}
