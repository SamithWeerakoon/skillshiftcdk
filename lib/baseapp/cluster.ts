import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ICluster } from 'aws-cdk-lib/aws-ecs';

interface ClusterStackProps {
  stackProps: StackProps;
  vpc: IVpc;
}

/**
 * Create an ECS cluster.
 * https://us-east-1.console.aws.amazon.com/ecs/v2/clusters?region=us-east-1
 */
export class ClusterStack extends Stack {
  readonly #cluster: ICluster;

  constructor(scope: Construct, id: string, props: ClusterStackProps) {
    super(scope, id, props.stackProps);
    this.#cluster = new Cluster(this, 'skilapp', {
      clusterName: 'skilapp-cluster',
      containerInsights: true,
      vpc: props.vpc,
    });
  }

  get cluster() {
    return this.#cluster;
  }
}
