import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class SsmParametersStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Store environment variables in SSM Parameter Store
    new StringParameter(this, 'ApiBaseUrl', {
      parameterName: 'NEXT_PUBLIC_API_BASE_URL',
      stringValue: 'https://api.example.com',
    });

    new StringParameter(this, 'SecretKey', {
      parameterName: 'SECRET_KEY',
      stringValue: 'my-secret-key',
    });
  }
}
