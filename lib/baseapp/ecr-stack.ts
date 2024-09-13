import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export class EcrStack extends Stack {
  public readonly repository: Repository;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create an ECR repository
    this.repository = new Repository(this, 'SkilShiftBaseRepo', {
      repositoryName: 'skill-shift',
    });
  }
}
