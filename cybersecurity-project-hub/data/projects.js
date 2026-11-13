
export const projects = [
   {
    title: "Deploying RESTFUL API's",
    category: "SECURITY",
    steps: "17 steps",
    estimate: "14 min",
    state: "Ready",
    image: "/deploying_restful_api.png",
    detail: ` Deploying RESTful API
    
Step 1    
Confirm region is set to N. Virginia (us-east-1)

Step 2
Go to Lambda -> Functions -> Create Function
Runtime -> Python (latest version)

Step 3
In Custom Settings -> Additional settings -> turn on Custom execution role
(this is an AWS Identity and Access Management IAM role that grants function permission to AWS services)

Under Execution role -> select the correct role that grants the right permission -> save
review -> create function

Step 4
Review the code witin the lambda function -> deploy

Step 5 
After success alert -> click Test -> Create new event
Invocation -> Synchronous
Event name -> FunctionName
Event sharing -> Private
Template -> API Gateway AWS Proxy

Step 6
Within Event JSON -> change the second parametre to the correct path
"resource": "/desiredPath",

Step 7
Click save and then Test
await for the response -> Executing function: succeeded

Step 8
Test events support iterative development by providing reusable test scenarious.
Testing with parametres such as {id} vlidates that your function correctly extracts and processes dynamic values from incoming requests - a critical capability for RESTful API operations.

Changes to JSON

"resource": "/pets/{id}",

PathParametres type
"id": 1

Step 9
Click save and then Test
await for the response -> Executing function: succeeded

Step 10 
Go to API Gateway -> Create an API
REST API -> Build

Step 11
API Details -> New API
API name
Description
API endpoint type -> Regional 
Click -> Create API

Step 12
Resources represent the hierarchical structure of the API, mapping URL points that clients use to different functionality. 
Under Resources click -> Create Resource
Resource name -> the url path
click -> Create Resource

Step 13
Click -> Create Method
Method Type -> GET
integration type -> Lambda function
Turn on -> Lambda proxy integration

Step 14
For Lambda function, review to confirm that the us-east-1 AWS Region is selected.
In the next search box, choose the labFunction ARN.
You created this Lambda function in an earlier step.
Click -> Create Method

Step 15
Click Test -> Test
Review the response returned
/name -Get method test results........should return the correct repsonse in body

Step 16
{id} is a dynamic resource path that captures variables from the URL. When a client requests /pets/3, API Gateway extracts the value and passes it to the Lambda function, which can then retrieve the specific identifier.
Under Resources click /{id} -> Create method

(repeated steps from above)
Click -> Create Method
Method Type -> GET
integration type -> Lambda function
Turn on -> Lambda proxy integration


For Lambda function, review to confirm that the us-east-1 AWS Region is selected.
In the next search box, choose the labFunction ARN.
You created this Lambda function in an earlier step.
Click -> Create Method

Stage 17
** In Test method make sure the Path id is filled in 
Test Method Path id -> 1

Click -> Test
on success -> Deploy API
Stage -> New Stage
Add Stage name & Description
Deploy `,
    sequence: ["Block public access", "Review policy history", "Notify data owners"]
  },
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