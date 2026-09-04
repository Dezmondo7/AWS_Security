
export const playbooks = [
  {
    title: "I IAM Over-privileged Role",
    description: "Investigation: The EC2 instance allows unauthenticated requests through IMDSv1. The role has an attached over-privileged policy that has broad S3 access. ",
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
    title: "AWS account compromise triage",
    category: "RESPONSE",
    steps: "11 steps",
    estimate: "25 min",
    state: "Ready",
    image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&q=80",
    detail: "A fast triage path for separating confirmed account takeover from noisy detections while protecting investigation evidence.",
    sequence: ["Secure the root boundary", "Scope affected principals", "Open the incident timeline"]
  },
  {
    title: "Rotate secrets without downtime",
    category: "OPERATIONS",
    steps: "6 steps",
    estimate: "9 min",
    state: "In review",
    image: "https://images.unsplash.com/photo-1518770660439-463ad161cf9?w=1200&q=80",
    detail: "Safely rotate application secrets with staged versions, health checks, and a rollback path that avoids service interruption.",
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