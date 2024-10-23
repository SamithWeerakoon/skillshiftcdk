// import * as cdk from 'aws-cdk-lib';
// import { Construct } from 'constructs';
// import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
// import { Cluster } from 'aws-cdk-lib/aws-ecs';

// export class NetworkStack extends cdk.Stack {
//   public readonly vpc: Vpc;
//   public readonly cluster: Cluster;

//   constructor(scope: Construct, id: string, props?: cdk.StackProps) {
//     super(scope, id, props);

//     // Create a VPC with public and private subnets
//     this.vpc = new Vpc(this, 'SkillShiftVpc', {
//       maxAzs: 2,  // Spread across 2 availability zones for redundancy
//       subnetConfiguration: [
//         {
//           name: 'PublicSubnet',
//           subnetType: SubnetType.PUBLIC,  // Public subnets for resources accessible from the internet
//         },
//         {
//           name: 'PrivateSubnet',
//           subnetType: SubnetType.PRIVATE_WITH_EGRESS,  // Private subnets for internal resources
//         }
//       ]
//     });

//     // Create an ECS Cluster within the VPC
//     this.cluster = new Cluster(this, 'SkillShiftCluster', {
//       vpc: this.vpc,
//       clusterName: 'SkillShiftCluster',  // Explicitly name the cluster
//     });

//     // Output VPC ID for cross-stack references
//     new cdk.CfnOutput(this, 'VpcIdOutput', {
//       value: this.vpc.vpcId,
//       exportName: 'SkillShiftVpcId',  // Export the VPC ID for use in other stacks
//     });

//     // Output ECS Cluster name for cross-stack references
//     new cdk.CfnOutput(this, 'ClusterNameOutput', {
//       value: this.cluster.clusterName,
//       exportName: 'SkillShiftClusterName',  // Export the ECS cluster name for use in other stacks
//     });

//     // Output public subnet IDs for cross-stack references (useful for ALB)
//     this.vpc.publicSubnets.forEach((subnet, index) => {
//       new cdk.CfnOutput(this, `PublicSubnet${index + 1}Output`, {
//         value: subnet.subnetId,
//         exportName: `PublicSubnet${index + 1}Id`,  // Export each public subnet ID
//       });
//     });
//   }
// }
