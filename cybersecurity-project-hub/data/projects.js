
export const projects = [
  
   {
    title: "Deploying RESTFUL API's",
    category: "SECURITY",
    steps: "17 steps",
    estimate: "14 min",
    state: "Ready",
    image: "/deploying_restful_api.png",
    detail: ` Deploying API with Database
    
Step 1    
Confirm region is set to N. Virginia (us-east-1)

Step 2
Go to DynamoDB -> Tables -> click Create Table

Step 3
For Table name, type:
rental_app

Make sure to use this exact table name or you will get AccessDenied errors later.

For Partition key, type:
record_type

For Sort key, type:
id

Finally click Create Table and review until status becomes active.


Step 4
Search Lambda -> click create Event Function

You can give a Lambda function any name that you like.

For Runtime, on the dropdown list, choose Python 3.14(latest version).

The available Python version on the AWS Management Console might be different from what is displayed in the screenshot example.

Under Permissions -> additional settings, click to expand Change default execution role.
For Execution role -> choose lab_function_role -> save

click Create Event Function


Step 5 
Import Python code to lambda function -> Deploy Function

******CODE******

# AWS SDK for Python (Boto3) - https://aws.amazon.com/sdk-for-python/
import json
import os
import boto3
import uuid
from datetime import datetime

# Initialize DynamoDB client
# Boto3 - DynamoDB - https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/dynamodb.html
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

def lambda_handler(event, context):
    """
    Lambda handler for processing API Gateway requests
    """
    http_method = event['httpMethod']
    path = event['path']
    
    # Route the request based on path and method
    if path == '/vehicles':
        if http_method == 'GET':
            return list_vehicles()
        elif http_method == 'POST':
            return create_vehicle(json.loads(event['body']) if 'body' in event else {})
        elif http_method == 'PUT':
            return update_vehicle(json.loads(event['body']) if 'body' in event else {})
    elif path == '/locations':
        if http_method == 'GET':
            return list_locations()
        elif http_method == 'POST':
            return create_location(json.loads(event['body']) if 'body' in event else {})
        elif http_method == 'PUT':
            return update_location(json.loads(event['body']) if 'body' in event else {})
    
    # Default response for unhandled routes
    return {
        'statusCode': 404,
        'body': json.dumps({'error': 'Not Found'})
    }

# Vehicle handlers
def create_vehicle(data):
    if not data:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Missing request body'})
        }
    
    item = {
        'id': str(uuid.uuid4())[:10],
        'record_type': 'vehicle',
        'createdAt': datetime.now().isoformat(),
        **data
    }
    
    table.put_item(Item=item)
    
    return {
        'statusCode': 201,
        'body': json.dumps(item)
    }

def update_vehicle(data):
    if not data or 'id' not in data:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Missing id in request body'})
        }
    
    item_id = data['id']
    update_expression = 'SET updatedAt = :updatedAt'
    expression_values = {
        ':updatedAt': datetime.now().isoformat()
    }
    
    # Build update expression dynamically
    for key, value in data.items():
        if key != 'id':
            update_expression += f', {key} = :{key}'
            expression_values[f':{key}'] = value
    
    table.update_item(
        Key={
            'id': item_id,
            'record_type': 'vehicle'
        },
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expression_values,
        ReturnValues='ALL_NEW'
    )
    
    return {
        'statusCode': 200,
        'body': json.dumps({'id': item_id, 'message': 'Vehicle updated successfully'})
    }

def list_vehicles():
    response = table.query(
        KeyConditionExpression='record_type = :record_type_val',
        ExpressionAttributeValues={':record_type_val': 'vehicle'}
    )
    
    return {
        'statusCode': 200,
        'body': json.dumps(response.get('Items', []))
    }

# Location handlers
def create_location(data):
    if not data:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Missing request body'})
        }
    
    item = {
        'id': str(uuid.uuid4())[:10],
        'record_type': 'location',
        'createdAt': datetime.now().isoformat(),
        **data
    }
    
    table.put_item(Item=item)
    
    return {
        'statusCode': 201,
        'body': json.dumps(item)
    }

def update_location(data):
    if not data or 'id' not in data:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Missing id in request body'})
        }
    
    item_id = data['id']
    update_expression = 'SET updatedAt = :updatedAt'
    expression_values = {
        ':updatedAt': datetime.now().isoformat()
    }
    
    # Build update expression dynamically
    for key, value in data.items():
        if key != 'id':
            update_expression += f', {key} = :{key}'
            expression_values[f':{key}'] = value
    
    table.update_item(
        Key={
            'id': item_id,
            'record_type': 'location'
        },
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expression_values,
        ReturnValues='ALL_NEW'
    )
    
    return {
        'statusCode': 200,
        'body': json.dumps({'id': item_id, 'message': 'Location updated successfully'})
    }

def list_locations():
    response = table.query(
        KeyConditionExpression='record_type = :record_type_val',
        ExpressionAttributeValues={':record_type_val': 'location'}
    )
    
    return {
        'statusCode': 200,
        'body': json.dumps(response.get('Items', []))
    }

'''
Test Event: Create location
{
  "httpMethod": "POST",
  "path": "/locations",
  "body": "{\"name\":\"Visitor entrance\",\"vehicles_available\":\"3\"}"
}

Test Event: Create vehicle
{
  "httpMethod": "POST",
  "path": "/vehicles",
  "body": "{\"type\":\"Scooter\",\"available\":\"True\"}"
}

Test Event: Update location
{
  "httpMethod": "PUT",
  "path": "/locations",
  "body": "{\"id\":\"REPLACE_WITH_LOCATION_ID\",\"vehicles_available\":\"2\"}"
}

Test Event: Update vehicle
{
  "httpMethod": "PUT",
  "path": "/vehicles",
  "body": "{\"id\":\"REPLACE_WITH_VEHICLE_ID\",\"available\":\"False\"}"
}
'''

******CODE******


Review to see that the code gets the DynamoDB table name through a Lambda environment variable

click -> Environment Variable -> Configuration -> Edit -> Add environment variable 

For Key, type:
TABLE_NAME

For Value, type:
rental_app

Click Save -> review success alert confirms.

Step 6
click -> Code
The Lambda function code demonstrates a common pattern for API backends: routing different HTTP methods (GET, POST, PUT) to corresponding database operations (list, create, update.
This single function handles multiple API endpointsm reducing operational complexity compared to managing seperate functions for each operation.
The code can effectively create, update and list items in the DynamoDB table.

Step 7
On lines 178–182, select (highlight) and copy the code block.

In the Explorer window, click Test.

On the dropdown list (not shown), choose Create new test event.

In the Create new test event window, for Event Name, type:
create_location

For Event sharing settings, choose or keep Private.  
For Event JSON, paste the code segment that you just copied.

******CODE******

{
  "httpMethod": "POST",
  "path": "/locations",
  "body": "{\"name\":\"Visitor entrance\",\"vehicles_available\":\"3\"}"
}

******CODE******

click Save


Step 8
In the Explorer window, click Test.

In the bottom Execution results window, review the results. 

- The logging information confirms that an item was successfully created in the DynamoDB table.

Status: Succeeded
Test Event Name: create_location

Response:
{
  "statusCode": 201,
  "body": "{\"id\": \"3fabfd45-e\", \"record_type\": \"location\", \"createdAt\": \"2026-11-16T13:52:35.676870\", \"name\": \"Visitor entrance\", \"vehicles_available\": \"3\"}"
}


Step 9
In the top navigation bar search box, type:
dynamoDB

In the search results, under Services, click DynamoDB -> click Tables -> rental_app

click Explore table items

review the data populated by the Lambda function.
Under id, select (highlight) and copy the available Id.


Step 10
Search API Gateway -> Create an API -> Build REST API

For API details, choose or keep New API.

For API name, type:
rental_app

For Security policy, choose TLS_1_0.
Scroll down to the bottom of the page, and then click Create API.


Step 11
click Create resource

For resource name, type:
locations

In the success alert, review the message.

In the Methods section, click Create method.

For Method type, choose GET.
For Integration type, choose Lambda function.
Turn on Lambda proxy integration.

For Lambda function, choose the Lambda function name that contains labFunction.
You created this Lambda function in an earlier step.

At the bottom of the page, click Create method.

In the Create resource pane, under the /locations resource, review to see that a new GET method is displayed

Step 12
On the Test tab, for Headers, type:
Content-Type:application/json

Click Test

Under Status, review the returned HTTP status code.
- A 200 status of code typically means that the request was successful.

Review the Response body.
- The Response body contains the list of all locations stored in the DynamoDB table.

Review the remainder of the output.
In the Create resource pane, click the /locations resource

Step 13
In the Methods section, click Create method.

For Method type, choose POST.
Turn on Lambda proxy integration.
For Lambda function, choose the Lambda function name that contains labFunction.

Scroll down to the bottom of the page, and then click Create method.

In the Create resource pane, under the /locations resource, review to see that a new POST method is now displayed.

Step 14
On the Test tab, for Headers, type:
Content-Type:application/json

For Request body, type:

{
    "name": "Viper roller coaster",
    "vehicles_available": "5"
}

- You can also copy-paste this text. If you receive an undefined value when you paste this, try again. The code should look similar to what is displayed in the screenshot example.

Scroll down to the bottom of the page, and then click Test.

Under Status, review the returned HTTP status code.
- A 201 status of code typically means a successful create request.

Review the Response body.
- The Response body contains the details of the new location created in the DynamoDB table.


Step 15
Navigate to the rental_app table on the Amazon DynamoDB console.

- Remember you can use the Services search box (or click Services) on the top navigation bar to navigate to a different service console.

In the Items returned section, click the refresh icon.
Review to see that the test from API Gateway successfully created a new location item.

Step 16
Navigate to the rental_app API on the API Gateway console.
Click Deploy API

In the pop-up box, for Stage, choose *New stage*.

For Stage name, type:
test

Click Deploy.

In the success alert, review the message.

`,
    sequence: ["Block public access", "Review policy history", "Notify data owners"]
  },
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