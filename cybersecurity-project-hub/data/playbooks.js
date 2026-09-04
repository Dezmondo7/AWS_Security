
export const playbooks = [
  {
    title: "I IAM Over-privileged Role",
    description: "Investigation: The EC2 instance allows unauthenticated HTTP GET requests through IMDSv1. The role has an attached over-privileged policy that has broad S3 access. ",
    category: "SECURITY",
    steps: "8 steps",
    estimate: "12 min",
    state: "Ready",
    image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=1200&q=80",
    detail: `It is time to investigate the misconfiguration. The lab environment has an EC2 instance running a simple web application.


First things first, save the account ID, as you will need it later. It is always convenient to save IDs and required details in environment variables.


OP Role
$ ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
Find the EC2 Instance
Showing the THM lab instance

List all instances in the account and save the instance ID.


OP Role
$ aws ec2 describe-instances \
    --filters "Name=instance-state-name,Values=running" \
    --query "Reservations[*].Instances[*].{ID:InstanceId,Name:Tags[?Key=='Name'],State:State.Name}" \
    --output table

------------------------------------
|         DescribeInstances        |
+----------------------+-----------+
|          ID          |   State   |
+----------------------+-----------+
|  i-0a91fac348b8b44e1 |  running  |
+----------------------+-----------+
|              Name              |
+---------+----------------------+
|   Key   |        Value         |
+---------+----------------------+
|  Name   |  webapp-server       |
+---------+----------------------+
You have found the instance; now let us investigate.

Check Instance Role
First, grab the IAM instance profile details.


OP Role
$ INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=webapp-server" "Name=instance-state-name,Values=running" \
    --query "Reservations[0].Instances[0].InstanceId" \
    --output text)

$ PROFILE_ARN=$(aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --query "Reservations[0].Instances[0].IamInstanceProfile.Arn" \
    --output text)
 
$ PROFILE_NAME=$(echo $PROFILE_ARN | awk -F'/' '{print $NF}') 

$ ROLE_NAME=$(aws iam get-instance-profile \
    --instance-profile-name $PROFILE_NAME \
    --query "InstanceProfile.Roles[0].RoleName" \
    --output text)

$ echo "Role Name: $ROLE_NAME"

Role Name: WebAppOverPrivRole-304038454789

$ echo "Instance Profile: $PROFILE_NAME"

Instance Profile: WebAppOverPrivProfile-304038454789
Review Permissions
First, let us look at the role policies.

Showing the IAM role attached to the instance


OP Role
$ aws iam list-attached-role-policies \
    --role-name $ROLE_NAME \
    --output json

{
    "AttachedPolicies": [
        {
            "PolicyName": "[REDACTED]",
            "PolicyArn": "arn:aws:iam::aws:policy/[REDACTED]"
        },
        {
            "PolicyName": "WebAppOverPrivS3Policy-304038454789",
            "PolicyArn": "arn:aws:iam::304038454789:policy/WebAppOverPrivS3Policy-304038454789"
        }
    ]
}
It is a good practice to also check the inline policies.


OP Role
$ aws iam list-role-policies \
    --role-name $ROLE_NAME \
    --output table

------------------
|ListRolePolicies|
+----------------+
From the outputs, you can see that a managed policy needs further investigation.


OP Role
$ POLICY_ARN=$(aws iam list-attached-role-policies \
    --role-name $ROLE_NAME \
    --query "AttachedPolicies[?contains(PolicyName,'OverPriv')].PolicyArn" \
    --output text)

$ POLICY_VERSION=$(aws iam get-policy \
    --policy-arn $POLICY_ARN \
    --query "Policy.DefaultVersionId" \
    --output text)

$ aws iam get-policy-version \
    --policy-arn $POLICY_ARN \
    --version-id $POLICY_VERSION \
    --query "PolicyVersion.Document" \
    --output json

{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Action": [
                "s3:*"
            ],
            "Resource": "*",
            "Effect": "Allow",
            "Sid": "OverPrivilegedS3Access"
        }
    ]
}
FINDING: The attached policy has broad S3 permissions. This means the role can perform any S3 action on any bucket.

Test Over-Privileged Access
Connect to the instance with SSM.


OP Role
$ aws ssm start-session --target $INSTANCE_ID

Starting session with SessionId: 304038454789-o6qvjy5lct8lrak7hlynnnv2oe

sh-5.2$
In the instance terminal, see what buckets you can list.


OP Role
sh-5.2$ aws s3 ls

2026-03-24 09:28:41 thm-finance-reports-304038454789
2026-03-24 09:28:41 thm-logs-archive-304038454789
2026-03-24 09:28:41 thm-webapp-data-304038454789
You should be able to list the web app bucket, but since the role is over-permissive, you can also list the finance bucket.


OP Role
sh-5.2$ ACCOUNT_ID=$(curl -s http://169.254.169.254/latest/meta-data/identity-credentials/ec2/info | grep AccountId | cut -d'"' -f4)

sh-5.2$ aws s3 ls s3://thm-webapp-data-$ACCOUNT_ID/

                           PRE assets/
                           PRE config/
                           PRE logs/

sh-5.2$ aws s3 ls s3://thm-finance-reports-$ACCOUNT_ID/

                           PRE confidential/
                           PRE flag/

sh-5.2$ aws s3 cp s3://thm-finance-reports-$ACCOUNT_ID/flag/overpowered-role.txt -

[REDACTED]
FINDING: This confirms that the instance role is over-permissive and can access every bucket in the account.

Check IMDS Configuration
Still in the instance session, you see that IMDS also provides security credential details with no authentication.


OP Role
sh-5.2$ curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/

WebAppOverPrivRole-304038454789
 
sh-5.2$ ROLE=$(curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/)

sh-5.2$ curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/$ROLE

{
  "Code" : "Success",
  "LastUpdated" : "2026-03-24T16:19:26Z",
  "Type" : "AWS-HMAC",
  "AccessKeyId" : "ASIAUNSQ2UYCRJQSSR46",
  "SecretAccessKey" : "m6K316Z2S+N2Jf5fIwpcYFE6ite4zkj7di9XnDly",
  "Token" : "IQoJb3JpZ2luX2VjENH[...]",
  "Expiration" : "2026-03-24T22:31:29Z"
}
Moving back to CloudShell, either by exiting the SSM session or opening another CloudShell tab, you can also check the IMDS configuration for the instance.


OP Role
$ aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --query "Reservations[0].Instances[0].MetadataOptions" \
    --output json

{
    "State": "applied",
    "HttpTokens": "optional",
    "HttpPutResponseHopLimit": 2,
    "HttpEndpoint": "enabled",
    "HttpProtocolIpv6": "disabled",
    "InstanceMetadataTags": "disabled"
}
FINDING: The HttpTokens field value is optional. This means IMDSv1 is allowed, which is insecure.

Findings Summary
Here is what you found so far:

The instance allows for simple unauthenticated requests to IMDS.
Through IMDSv1, you can retrieve credentials that can be used to assume the attached role.
The role has an attached policy that allows broad S3 access.
So if the web application has any vulnerability that can be exploited, it will result in the exfiltration of sensitive data. That's not good.`,
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
    detail: ` Now that you understand the problem, it is time to fix it.

If needed, start a new CloudShell session and reset the variables you will use in this task.


OP Role
$ ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

$ INSTANCE_ID=$(aws ec2 describe-instances \
      --filters "Name=tag:Name,Values=webapp-server" "Name=instance-state-name,Values=running" \
      --query "Reservations[0].Instances[0].InstanceId" --output text)
 
$ ROLE_NAME="WebAppOverPrivRole-$ACCOUNT_ID"
 
$ echo "ACCOUNT_ID=$ACCOUNT_ID  INSTANCE_ID=$INSTANCE_ID  ROLE_NAME=$ROLE_NAME"

ACCOUNT_ID=304038454789
INSTANCE_ID=i-0a91fac348b8b44e1
ROLE_NAME=WebAppOverPrivRole-304038454789
Understand the Requirements
The web application for this exercise would require the following permissions:

Read configuration file from the config object in the web app bucket.
Read static assets from the assets object in the web app bucket.
Write application logs to the logs object in the web app bucket.
That means the role should be limited to:

s3:GetObject on config and assets.
s3:PutObject on logs.
s3:ListBucket solely on the web app bucket.
No need to access any other bucket in the account.
Create a Scoped Policy
Save the policy in a local file so you can attach it to the role.

Expand to see the full policy

Create the policy.


OP Role
$ aws iam create-policy \
    --policy-name WebAppScopedS3Policy \
    --policy-document file://webapp-scoped-policy.json

{
    "Policy": {
        "PolicyName": "WebAppScopedS3Policy",
        "PolicyId": "ANPAUNSQ2UYC73A5NMGRS",
        "Arn": "arn:aws:iam::304038454789:policy/WebAppScopedS3Policy",
        "Path": "/",
        "DefaultVersionId": "v1",
        "AttachmentCount": 0,
        "PermissionsBoundaryUsageCount": 0,
        "IsAttachable": true,
        "CreateDate": "2026-03-24T16:43:08+00:00",
        "UpdateDate": "2026-03-24T16:43:08+00:00"
    }
}
Swap the Role Policy
Detach the over-privileged policy.


OP Role
$ OLD_POLICY_ARN=$(aws iam list-attached-role-policies \
    --role-name $ROLE_NAME \
    --query "AttachedPolicies[?contains(PolicyName,'OverPriv')].PolicyArn" \
    --output text)

$ aws iam detach-role-policy \
    --role-name $ROLE_NAME \
    --policy-arn $OLD_POLICY_ARN
Attach the new policy.


OP Role
$ NEW_POLICY_ARN="arn:aws:iam::{ACCOUNT_ID}:policy/WebAppScopedS3Policy"

$ aws iam attach-role-policy \
    --role-name $ROLE_NAME \
    --policy-arn $NEW_POLICY_ARN
Enforce IMDSv2
Harden the metadata service.


Note: This does NOT require stopping or restarting the instance, but any credentials issued via IMDSv1 remain valid for up to 6 hours.


OP Role
$ aws ec2 modify-instance-metadata-options \
    --instance-id $INSTANCE_ID \
    --http-tokens required \
    --http-endpoint enabled \
    --http-put-response-hop-limit 1

{
    "InstanceId": "i-0a91fac348b8b44e1",
    "InstanceMetadataOptions": {
        "State": "pending",
        "HttpTokens": "required",
        "HttpPutResponseHopLimit": 1,
        "HttpEndpoint": "enabled",
        "HttpProtocolIpv6": "disabled",
        "InstanceMetadataTags": "disabled"
    }
}

Note: --http-put-response-hop-limit 1 is a best practice to limit network hops to 1, preventing containers or reverse proxies from forwarding metadata tokens to external endpoints.

Verify
Coming back to the instance SSM session, or starting a new one, you can see that IMDS is not as friendly anymore.


OP Role
sh-5.2$ ACCOUNT_ID=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" | xargs -I{} \
    curl -s -H "X-aws-ec2-metadata-token: {}" \
    http://169.254.169.254/latest/dynamic/instance-identity/document | grep -o '"accountId" : "[^"]*"' | cut -d'"' -f4)

sh-5.2$ aws s3 ls s3://thm-finance-reports-$ACCOUNT_ID/

An error occurred (AccessDenied) when calling the ListObjectsV2 operation: [...]
But the required permissions are applied.


OP Role
sh-5.2$ aws s3 ls s3://thm-webapp-data-$ACCOUNT_ID/config/

2026-03-26 09:06:47         58 app.conf
2026-03-26 09:06:47         44 db.conf
Lastly, you can grab the flag for successfully remediating the misconfiguration. Make sure you run this in a separate CloudShell tab, not in the instance session.


OP Role
$ aws lambda invoke \
    --function-name AWS203-VerifyRemediation \
    --payload '{}' \
    /tmp/verify-output.json && python3 -m json.tool /tmp/verify-output.json

[...]
{
    "policy_check": "PASS — over-privileged policy removed",
    "scoped_policy_check": "PASS — WebAppScopedS3Policy attached",
    "imds_check": "PASS — IMDSv2 enforced (HttpTokens=required)",
    "status": "PASS",
    "flag": "[REDACTED]"
}  `,
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
    detail: ` So how would you build this securely from the start? Here is how you can do it.

The first step should always be to understand the requirements. Before creating any IAM resource, answer these questions:

What AWS service will assume this role? Common examples are: EC2, Lambda, or ECS.
What API actions does the end service need? The end service can be anything from a web application to automation or IaC.
What specific resources does it access? Common examples are: bucket names, table names, or ARNs.
Are there conditions that should limit access further? These can include: VPC, source IP, tags, or timeframe.
For this exercise, you will assume the requirements provided earlier, but you will start fresh to implement the required web app role.

To ensure you have the correct details, reset the required environment variables.


Note: A permission boundary is an IAM policy that sets the maximum permissions an identity can have, superseding other more permissive policies. The lab has a preconfigured policy named Room23-DevRoleBoundary that you will use.


OP Role
$ ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

$ BOUNDARY_ARN="arn:aws:iam::{ACCOUNT_ID}:policy/Room23-DevRoleBoundary"

$ echo "ACCOUNT_ID=$ACCOUNT_ID"

ACCOUNT_ID=304038454789

$ echo "BOUNDARY_ARN=$BOUNDARY_ARN"

BOUNDARY_ARN=arn:aws:iam::304038454789:policy/Room23-DevRoleBoundary
Save the Policies
The trust policy defines who can assume the role. For an EC2, only the EC2 service should be allowed. Key points to note:

Never use "Principal":"*" because this allows any entity to assume the role.
Never add IAM users or other accounts to the trust policy unless cross-account access is explicitly required.
For EC2, the principal is always ec2.amazonaws.com.

Save the trust policy so you can attach it later.


OP Role
$ cat > ./trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
Save the permission policy scoped to the requirements.

Expand to see the full policy


Note: Further hardening can be done by using aws:SourceVpc as a condition; this ensures API calls are denied outside the source VPC, limiting the blast radius. At the same time, you will also need a VPC endpoint, but this is outside the scope of the exercise.

Create the Role
First, create the role with the permission boundary provided in the lab.


OP Role
$ aws iam create-role \
    --role-name SecureWebAppRole \
    --assume-role-policy-document file://trust-policy.json \
    --permissions-boundary $BOUNDARY_ARN \
    --description "Least-privilege role for the web application"

{
    "Role": {
        "Path": "/",
        "RoleName": "SecureWebAppRole",
        "RoleId": "AROAUNSQ2UYC6BIYQX3KT",
        "Arn": "arn:aws:iam::304038454789:role/SecureWebAppRole",
        "CreateDate": "2026-03-24T16:58:31+00:00",
[...]
Then, create the managed policy from the previously saved file. Make sure you save the ARN.


OP Role
$ aws iam create-policy \
    --policy-name SecureWebAppS3Policy \
    --policy-document file://secure-webapp-policy.json \
    --description "Scoped S3 access for the web application"

{
    "Policy": {
        "PolicyName": "SecureWebAppS3Policy",
        "PolicyId": "ANPAUNSQ2UYCWTVL7MEJB",
        "Arn": "arn:aws:iam::304038454789:policy/SecureWebAppS3Policy",
        "Path": "/",
[...]
Attach the policy to the role. You will also attach the SSM policy for managing instance access.


OP Role
$ SECURE_POLICY_ARN="arn:aws:iam::{ACCOUNT_ID}:policy/SecureWebAppS3Policy"

$ aws iam attach-role-policy \
    --role-name SecureWebAppRole \
    --policy-arn $SECURE_POLICY_ARN

$ aws iam attach-role-policy \
    --role-name SecureWebAppRole \
    --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
Create the Instance Profile
You can now create an instance profile and add the role to that profile.


OP Role
$ aws iam create-instance-profile \
    --instance-profile-name SecureWebAppProfile

{
    "InstanceProfile": {
        "Path": "/",
        "InstanceProfileName": "SecureWebAppProfile",
        "InstanceProfileId": "AIPAWA3VODMXVUWE4KSRD",
        "Arn": "arn:aws:iam::304038454789:instance-profile/SecureWebAppProfile",
        "CreateDate": "2026-03-25T07:18:52+00:00",
        "Roles": []
    }
}

$ aws iam add-role-to-instance-profile \
    --instance-profile-name SecureWebAppProfile \
    --role-name SecureWebAppRole
Verify
You can run the helper Lambda function to see if everything was set up correctly.


OP Role
$ aws lambda invoke \
  --function-name AWS203-VerifySecureBuild \
  --payload '{}' \
  /tmp/verify-secure.json && python3 -m json.tool /tmp/verify-secure.json

{
  "role_found": "SecureWebAppRole",
  "boundary_check": "PASS — Room23-DevRoleBoundary applied",
  "trust_check": "PASS — only ec2.amazonaws.com in trust policy",
  "policy_check": "PASS — no overly-broad policies attached",
  "status": "PASS",
  "flag": "[REDACTED]"
}
Now grab the well-earned flag from the output. `,
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