
export const playbooks = [
  {
    title: "IAM & IMDS Security Investigation: Over-Privileged EC2 Role",
    description: "Investigating an over-privileged IAM instance profile and IMDSv1 misconfiguration on a production EC2 workload. ",
    category: "SECURITY",
    steps: "8 steps",
    estimate: "12 min",
    state: "Ready",
    image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=1200&q=80",
    detail: ` Phase 1: Environment & Instance Discovery
--------------------------------------------------
To establish baseline context and avoid hardcoding values, initial account and instance parameters were stored in local environment variables.

$ ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
$ echo "Account_id: \${ACCOUNT_ID}"

Next, all running EC2 instances were enumerated to isolate the target workload:

$ aws ec2 describe-instances \\
    --filters "Name=instance-state-name,Values=running" \\
    --query "Reservations[*].Instances[*].{ID:InstanceId,Name:Tags[?Key=='Name'],State:State.Name}" \\
    --output table

------------------------------------
|          DescribeInstances        |
+----------------------+-----------+
|          ID          |   State   |
+----------------------+-----------+
|  i-0a91fac348b8b44e1 |  running  |
+----------------------+-----------+
|              Name                |
+---------+------------------------+
|   Key   |        Value           |
+---------+------------------------+
|  Name   |   webapp-server        |
+---------+------------------------+


Phase 2: IAM Instance Profile & Policy Analysis
--------------------------------------------------
Once the target instance (\`webapp-server\`) was identified, the associated IAM instance profile and role were extracted for inspection:

$ INSTANCE_ID=$(aws ec2 describe-instances \\
    --filters "Name=tag:Name,Values=webapp-server" "Name=instance-state-name,Values=running" \\
    --query "Reservations[0].Instances[0].InstanceId" \\
    --output text)

$ PROFILE_ARN=$(aws ec2 describe-instances \\
    --instance-ids \${INSTANCE_ID} \\
    --query "Reservations[0].Instances[0].IamInstanceProfile.Arn" \\
    --output text)

$ PROFILE_NAME=$(echo \${PROFILE_ARN} | awk -F'/' '{print \$NF}') 

$ ROLE_NAME=$(aws iam get-instance-profile \\
    --instance-profile-name \${PROFILE_NAME} \\
    --query "InstanceProfile.Roles[0].RoleName" \\
    --output text)

$ echo "Role Name: \${ROLE_NAME}"
Role Name: WebAppOverPrivRole-304038454789

Attached customer-managed and inline IAM policies were enumerated next:

$ aws iam list-attached-role-policies \\
    --role-name \${ROLE_NAME} \\
    --output json

{
    "AttachedPolicies": [
        {
            "PolicyName": "WebAppOverPrivS3Policy-304038454789",
            "PolicyArn": "arn:aws:iam::304038454789:policy/WebAppOverPrivS3Policy-304038454789"
        }
    ]
}

Inline policies were explicitly checked (as inline policies often obscure standard IAM auditing):

$ aws iam list-role-policies \\
    --role-name \${ROLE_NAME} \\
    --output table

------------------
|ListRolePolicies|
+----------------+

Deep inspection of the default policy version for \`WebAppOverPrivS3Policy\` was performed:

$ POLICY_ARN=$(aws iam list-attached-role-policies \\
    --role-name \${ROLE_NAME} \\
    --query "AttachedPolicies[?contains(PolicyName,'OverPriv')].PolicyArn" \\
    --output text)

$ POLICY_VERSION=$(aws iam get-policy \\
    --policy-arn \${POLICY_ARN} \\
    --query "Policy.DefaultVersionId" \\
    --output text)

$ aws iam get-policy-version \\
    --policy-arn \${POLICY_ARN} \\
    --version-id \${POLICY_VERSION} \\
    --query "PolicyVersion.Document" \\
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

[FINDING 1]: CRITICAL MISCONFIGURATION
The attached IAM policy explicitly grants "s3:*" across "Resource": "*". This allows the web app role to perform any action on any S3 bucket in the account.


Phase 3: Exploitation & BLAST RADIUS PROOF OF CONCEPT
--------------------------------------------------
To test the real-world impact of this policy, an AWS Systems Manager (SSM) session was opened directly to the instance:

$ aws ssm start-session --target \${INSTANCE_ID}
Starting session with SessionId: 304038454789-o6qvjy5lct8lrak7hlynnnv2oe

sh-5.2$ aws s3 ls
2026-03-24 09:28:41 thm-finance-reports-304038454789
2026-03-24 09:28:41 thm-logs-archive-304038454789
2026-03-24 09:28:41 thm-webapp-data-304038454789

While the web server should only access \`thm-webapp-data\`, the wild-card permissions permitted full access to restricted organizational assets:

sh-5.2$ ACCOUNT_ID=$(curl -s http://169.254.169.254/latest/meta-data/identity-credentials/ec2/info | grep AccountId | cut -d'"' -f4)

sh-5.2$ aws s3 ls s3://thm-finance-reports-\${ACCOUNT_ID}/
                           PRE confidential/
                           PRE flag/

sh-5.2$ aws s3 cp s3://thm-finance-reports-\${ACCOUNT_ID}/flag/overpowered-role.txt -
[CONFIDENTIAL DATA EXFILTRATED]

[FINDING 2]: CONFIRMED PRIVILEGE ESCALATION / DATA EXFILTRATION
The instance role permits unauthenticated horizontal data access across unauthorized S3 buckets outside the web application domain.


Phase 4: Instance Metadata Service (IMDS) Audit
--------------------------------------------------
From inside the SSM session, the local Instance Metadata Service (IMDS) endpoint was audited:

sh-5.2$ curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/
WebAppOverPrivRole-304038454789

sh-5.2$ ROLE=$(curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/)
sh-5.2$ curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/\${ROLE}

{
  "Code" : "Success",
  "AccessKeyId" : "ASIAUNSQ2UYCRJQSSR46",
  "SecretAccessKey" : "m6K316Z2S+N2Jf5fIwpcYFE6ite4zkj7di9XnDly",
  "Token" : "IQoJb3JpZ2luX2VjENH[...]"
}

Auditing the metadata configuration via EC2 API confirmed IMDS enforcement levels:

$ aws ec2 describe-instances \\
    --instance-ids \${INSTANCE_ID} \\
    --query "Reservations[0].Instances[0].MetadataOptions" \\
    --output json

{
    "State": "applied",
    "HttpTokens": "optional",
    "HttpPutResponseHopLimit": 2,
    "HttpEndpoint": "enabled"
}

[FINDING 3]: INSECURE IMDS CONFIGURATION
"HttpTokens": "optional" indicates IMDSv1 is active. Standard HTTP GET requests require no session token authentication, leaving temporary STS credentials vulnerable to SSRF (Server-Side Request Forgery) attacks.


Summary of Investigation Findings
--------------------------------------------------
1. IMDSv1 Enabled: Unauthenticated HTTP GET requests allow local credential harvesting.
2. Exposure Risk: Any web app vulnerability (e.g., SSRF, Local File Inclusion) grants an attacker local IAM credential access.
3. Over-Privileged Role: The attached IAM policy grants full s3:* permissions account-wide, enabling immediate multi-bucket data exfiltration. `,

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
    detail: ` Following the investigation, identified security misconfigurations will now be remediated. Please note that within the write-ups, at certain times when ACCOUNT_ID is called the $ has been removed for the purpose of this write up as it calls a variable within the code. 

Terminal
$ ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

$ INSTANCE_ID=$(aws ec2 describe-instances \
      --filters "Name=tag:Name,Values=webapp-server" "Name=instance-state-name,Values=running" \
      --query "Reservations[0].Instances[0].InstanceId" --output text)
 
$ ROLE_NAME="WebAppOverPrivRole-$ACCOUNT_ID"
 
$ echo "ACCOUNT_ID=$ACCOUNT_ID  INSTANCE_ID=$INSTANCE_ID  ROLE_NAME=$ROLE_NAME"

ACCOUNT_ID=304038454789
INSTANCE_ID=i-0a91fac348b8b44e1
ROLE_NAME=WebAppOverPrivRole-304038454789

Defining the requirements
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
cat > ./webapp-scoped-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadConfigAndAssets",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::thm-webapp-data-{ACCOUNT_ID}/config/*",
        "arn:aws:s3:::thm-webapp-data-{ACCOUNT_ID}/assets/*"
      ]
    },
    {
      "Sid": "WriteLogs",
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": ["arn:aws:s3:::thm-webapp-data-{ACCOUNT_ID}/logs/*"]
    },
    {
      "Sid": "ListAppBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::thm-webapp-data-{ACCOUNT_ID}"],
      "Condition": {
        "StringLike": {
          "s3:prefix": ["config/*", "assets/*", "logs/*"]
        }
      }
    }
  ]
}
EOF

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