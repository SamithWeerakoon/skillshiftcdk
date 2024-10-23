import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { SubnetType, SubnetConfiguration, IVpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

interface NetworkStackProps {
  stackProps?: cdk.StackProps;
}

export class NetworkStack extends cdk.Stack {
  readonly #vpc: IVpc;

  constructor(
    scope: Construct,
    id: string,
    networkStackProps: NetworkStackProps,
  ) {
    super(scope, id, networkStackProps.stackProps);

    // Create a VPC with minimal resources (1 AZ, 1 NAT gateway)
    this.#vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 1,  // Limit to a single availability zone
      natGateways: 1,  // Only one NAT gateway for private subnet
      subnetConfiguration: this.createSubnetConfigurations(),  // Define public/private subnets
    });
  }

  // Getter for VPC
  get vpc(): IVpc {
    return this.#vpc;
  }

  // Subnet configurations for public and private subnets
  createSubnetConfigurations(): Array<SubnetConfiguration> {
    return [
      { name: 'public', subnetType: SubnetType.PUBLIC },
      { name: 'private', subnetType: SubnetType.PRIVATE_WITH_EGRESS },
    ].map((value) => {
      return {
        name: value.name,
        subnetType: value.subnetType,
        cidrMask: 24,  // Define the subnet size (CIDR mask)
      };
    });
  }
}
