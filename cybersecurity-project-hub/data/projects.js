
export const projects = [
  {
    title: "Setting up an EC2 Instance",
    description: "Launching an Amazon EC2 instance configuring a user data script to display in the instance browser.",
    category: "EC2 Instance Configuration",
    steps: "8 steps",
    estimate: "12 min",
    state: "Ready",
    image: "/deploying_ec2.png",
    detail: ` Launching an EC2 Instance & Configuring a user data script

Step 1    
Confirm region is set to N. Virginia (us-east-1)

Step 2
Go to S3 -> General purpose buckets
Click the cloud-first-steps bucket

-> Objects -> checkbox to select user-data.txt

This opens in a new browser tab -> Review the file contents => Download and save user-data.txt to your device

Step 3
Navigate to EC2 -> Launch Instance

Name -> Webserver01 ~
Application and OS Image -> Amazon Linux
Amazon Machine Image -> Amazon Linux 2023 Kernel-6.1 AMI. 

Click Compare Instance types -> choose t3.micro
Click get advice and review different instance type requirements

Confirm t3.micro is selected
In this instance -> Proceed without key pair. 

Step 4
Network settings -> Edit
VPC -> cloud-first-steps/LabVpc
Subnet -> us-easr-1a Availability Zone
Security Group name -> Lab-SG
Description -> HTTP Security Group
Type -> HTTP

Configure storage
1x -> 8 GiB -> gp3

Step 5
Click Advanced details -> Choose file -> upload the previously saved file user-data.txt

Step 6
Review Summary -> Launch Instance

Review alert message

Step 7
Click View all instances

The instance named Webserver01 will be in pending state before entering running state when ready for use
Refresh, once running Click -> Public IPV4 DNS icon [] ** Not open address**

In new browser type http: and paste DNS address. 
Instance details will be available

Step 8
If connection timeout message appears check http: and not https: `,
    sequence: ["Disable the key", "Review CloudTrail use", "Rotate and validate"]
  },
  {
    title: "II IAM Over-privileged Role",
    description: "Remediation: New policy creation and detachment of over-privileged policy. Implementation of IMDSv2 with the use of HTTPTokens and HTTPPutResponseHopLimit.",
    category: "REMEDIATION",
    steps: "11 steps",
    estimate: "25 min",
    state: "Ready",
    image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&q=80",
    detail: ` `,
    sequence: ["Secure the root boundary", "Scope affected principals", "Open the incident timeline"],
  },
  {
    title: "III IAM Over-privileged Role",
    description: "Secure Build: In order to create a secure IAM resource consideration must be put into AWS service, API requirments, resources and conditions.",
    category: "OPERATIONS",
    steps: "6 steps",
    estimate: "9 min",
    state: "In review",
    image: "https://images.unsplash.com/photo-1518770660439-463ad161cf9?w=1200&q=80",
    detail: ` `,
    sequence: ["Create the new version", "Deploy and observe", "Revoke the old version"]
  },
  {
    title: "Contain a public S3 bucket",
    category: "SECURITY",
    steps: "7 steps",
    estimate: "14 min",
    state: "Ready",
    image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80",
    detail: "Lock down unintended public access, identify the exposure window, and coordinate remediation with the bucket owner.",
    sequence: ["Block public access", "Review policy history", "Notify data owners"]
  },
  {
    title: "Evidence collection for IR",
    category: "FORENSICS",
    steps: "9 steps",
    estimate: "18 min",
    state: "Ready",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&q=80",
    detail: "Collect volatile and durable evidence in a repeatable order while maintaining chain of custody for later analysis.",
    sequence: ["Create an evidence vault", "Export relevant logs", "Record hashes"]
  },
  {
    title: "Deploy a detective control",
    category: "GOVERNANCE",
    steps: "5 steps",
    estimate: "11 min",
    state: "Draft",
    image: "https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=1200&q=80",
    detail: "Introduce a measurable detective control with an owner, alert route, and operating threshold that teams can maintain.",
    sequence: ["Define the signal", "Configure the rule", "Test the escalation"]
  }
];