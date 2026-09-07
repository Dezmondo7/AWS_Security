export const playbooks = [
  {
    title: "AWS IAM & IMDS Security Investigation: Over-Privileged EC2 Role",
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
    title: "AWS IAM & IMDS Security Remediation: Over-Privileged EC2 Role",
    description: "Remediating wildcard S3 permissions via custom customer-managed policies and mitigating SSRF credential harvest vectors by least privilege enforce and IMDSv2 Hardening.",
    category: "REMEDIATION",
    steps: "11 steps",
    estimate: "25 min",
    state: "Ready",
    image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&q=80",
    detail: ` Phase 5: Remediation & Security Hardening
--------------------------------------------------
Following the investigation, active remediation steps were executed to apply the principle of least privilege to the IAM role and enforce IMDSv2 at the instance metadata level.

Step 1: Define Least-Privilege Requirements
The web application workload requires strictly scoped permissions:
  - Read access to configuration parameters (s3:GetObject on /config/*)
  - Read access to static application assets (s3:GetObject on /assets/*)
  - Write access for runtime application logs (s3:PutObject on /logs/*)
  - List access restricted exclusively to application bucket prefixes (s3:ListBucket)

Step 2: Author & Deploy Scoped IAM Policy
A custom, tightly-scoped IAM policy document (\`webapp-scoped-policy.json\`) was generated locally:

$ cat > ./webapp-scoped-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadConfigAndAssets",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::thm-webapp-data-\${ACCOUNT_ID}/config/*",
        "arn:aws:s3:::thm-webapp-data-\${ACCOUNT_ID}/assets/*"
      ]
    },
    {
      "Sid": "WriteLogs",
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": ["arn:aws:s3:::thm-webapp-data-\${ACCOUNT_ID}/logs/*"]
    },
    {
      "Sid": "ListAppBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::thm-webapp-data-\${ACCOUNT_ID}"],
      "Condition": {
        "StringLike": {
          "s3:prefix": ["config/*", "assets/*", "logs/*"]
        }
      }
    }
  ]
}
EOF

Deploying the new scoped IAM policy to the account:

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

Step 3: Detach Over-Privileged Policy & Swap Managed Policies
The broad wildcard policy was safely detached from the role, and the newly created least-privilege policy was attached:

$ OLD_POLICY_ARN=$(aws iam list-attached-role-policies \
    --role-name \${ROLE_NAME} \
    --query "AttachedPolicies[?contains(PolicyName,'OverPriv')].PolicyArn" \
    --output text)

$ aws iam detach-role-policy \
    --role-name \${ROLE_NAME} \
    --policy-arn \${OLD_POLICY_ARN}

$ NEW_POLICY_ARN="arn:aws:iam::\${ACCOUNT_ID}:policy/WebAppScopedS3Policy"

$ aws iam attach-role-policy \
    --role-name \${ROLE_NAME} \
    --policy-arn \${NEW_POLICY_ARN}

[REMEDIATION CHECKPOINT 1]: Wildcard s3:* access severed. Instance role scoped strictly to thm-webapp-data prefixes.


Step 4: Enforce IMDSv2 (Session Token Requirement)
To mitigate SSRF exploitation vectors and unauthenticated metadata harvesting, IMDSv2 was mandated on the EC2 instance. The hop limit was restricted to 1 to block container/proxy token forwarding:

$ aws ec2 modify-instance-metadata-options \
    --instance-id \${INSTANCE_ID} \
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

Note: Enforcing IMDSv2 does not require an instance reboot, though existing session tokens issued prior to enforcement expire via standard TTL.


Step 5: Verification & Verification Proof
Re-testing access from inside the instance SSM session confirms that unauthorized cross-bucket access is blocked while application operations function as expected:

1. Unauthorized Access Attempt (Finance Bucket):
sh-5.2$ aws s3 ls s3://thm-finance-reports-\${ACCOUNT_ID}/
An error occurred (AccessDenied) when calling the ListObjectsV2 operation. 

Terminal 
sh-5.2$ ACCOUNT_ID=$(curl -s -X PUT "http://169.254.169.254/latest/api/token"     -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" | xargs -I{}     curl -s -H "X-aws-ec2-metadata-token: {}"     http://169.254.169.254/latest/dynamic/instance-identity/document | grep -o '"accountId" : "[^"]*"' | cut -d'"' -f4)

sh-5.2$ aws s3 ls s3://thm-finance-reports-$ACCOUNT_ID/

An error occurred (AccessDenied) when calling the ListObjectsV2 operation: [...]
But the required permissions are applied.

2. Authorized Access Attempt (App Config Prefix):

Terminal 
sh-5.2$ aws s3 ls s3://thm-webapp-data-\${ACCOUNT_ID}/config/

2026-03-26 09:06:47         58 app.conf
2026-03-26 09:06:47         44 db.conf [PASS: Access Granted]

Executing automated compliance validation via AWS Lambda:

$ aws lambda invoke \
    --function-name AWS203-VerifyRemediation \
    --payload '{}' \
    /tmp/verify-output.json && python3 -m json.tool /tmp/verify-output.json

{
    "policy_check": "PASS — over-privileged policy removed",
    "scoped_policy_check": "PASS — WebAppScopedS3Policy attached",
    "imds_check": "PASS — IMDSv2 enforced (HttpTokens=required)",
    "status": "PASS",
    "flag": "[REDACTED]"
}

Summary of Remediation Findings
1. Least Privilege Enforcement: All roles must be scoped with Least Privilege and granted minimum permissions necessary for an identity (user, group or service role) to perform its function.
2. Policy Alignment: Policies must aline with scoped requirements and accurately reflect the functional boundaries of the application.
3. IMDSv2 Token Requirement: Require Tokens (HttpTokens=required): Forces all requests to the Instance Metadata Service (169.254.169.254) to use a session token obtained via an initial HTTP PUT request with a custom header (X-aws-ec2-metadata-token-ttl-seconds). Simple HTTP GET requests used in standard SSRF attacks fail.
4. Hop Limit Restriction: Setting the response hop limit to 1 prevents the PUT response packet containing the token from traveling beyond the host OS `,
    sequence: ["Secure the root boundary", "Scope affected principals", "Open the incident timeline"],
  },
  {
    title: "AWS IAM & IMDS Security Secure Build: Over-Privileged EC2 Role",
    description: "Designing and deploying a secure, least-privilege EC2 instance role enforcing trust policies, permissions boundaries, and path-scoped IAM policies.",
    category: "OPERATIONS",
    steps: "6 steps",
    estimate: "9 min",
    state: "In review",
    image: "/secure_cloud.jpg",
    detail: ` Phase 6: Secure Architectural Design & Implementation
--------------------------------------------------
To prevent future security debt, a brand-new, hardened IAM role was deployed from scratch using a least-privilege paradigm, strict trust scoping, and permission boundaries.

Step 1: Security Requirement Analysis
Before provisioning resources, core security controls were defined:
  - Principal Scope: Restrict trust relationship exclusively to ec2.amazonaws.com.
  - Action Scope: Enforce path-level read/write permissions on target S3 prefixes.
  - Guardrails: Attach explicit permissions boundary to restrict maximum administrative scope.

  Step 2: Environment Initialization & Policy Authoring
Initializing execution variables and establishing the permissions boundary context:

Terminal
$ ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
$ BOUNDARY_ARN="arn:aws:iam::{ACCOUNT_ID}:policy/Room23-DevRoleBoundary"

$ echo "ACCOUNT_ID=\${ACCOUNT_ID} BOUNDARY_ARN=\${BOUNDARY_ARN}"
ACCOUNT_ID=304038454789 BOUNDARY_ARN=arn:aws:iam::304038454789:policy/Room23-DevRoleBoundary

Save the Policies
The trust policy defines who can assume the role. For an EC2, only the EC2 service should be allowed. Key points to note:

Never use "Principal":"*" because this allows any entity to assume the role.
Never add IAM users or other accounts to the trust policy unless cross-account access is explicitly required.
For EC2, the principal is always ec2.amazonaws.com.

Authoring the restrictive trust policy (\`trust-policy.json\`):

Terminal
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

Authoring the scoped application permission policy (\`secure-webapp-policy.json\`):

Terminal
$ cat > ./secure-webapp-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadConfigAndAssets",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::thm-webapp-data-\${ACCOUNT_ID}/config/*",
        "arn:aws:s3:::thm-webapp-data-\${ACCOUNT_ID}/assets/*"
      ]
    },
    {
      "Sid": "WriteLogs",
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": ["arn:aws:s3:::thm-webapp-data-\${ACCOUNT_ID}/logs/*"]
    },
    {
      "Sid": "ListAppBucketPrefixes",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::thm-webapp-data-\${ACCOUNT_ID}"],
      "Condition": {
        "StringLike": {
          "s3:prefix": ["config/*", "assets/*", "logs/*"]
        }
      }
    }
  ]
}
EOF


Note: Further hardening can be done by using aws:SourceVpc as a condition; this ensures API calls are denied outside the source VPC, limiting the blast radius. At the same time, you will also need a VPC endpoint.

Step 3: Provision IAM Role with Permissions Boundary
Creating the new IAM role while attaching the preconfigured security boundary:


Terminal
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
    }
}

Step 4: Provision & Attach Managed Policies
Creating the customer-managed S3 policy and attaching necessary operational policies (including SSM Core for instance access):


Terminal
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
    }
}

Attach the policy to the role. You will also attach the SSM policy for managing instance access.

Terminal
$ SECURE_POLICY_ARN="arn:aws:iam::{ACCOUNT_ID}:policy/SecureWebAppS3Policy"

$ aws iam attach-role-policy \
    --role-name SecureWebAppRole \
    --policy-arn $SECURE_POLICY_ARN

$ aws iam attach-role-policy \
    --role-name SecureWebAppRole \
    --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore


Step 5: Provision Instance Profile & Bind Role
Creating the EC2 Instance Profile wrapper and binding the secure role:


Terminal
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

Terminal
$ aws iam add-role-to-instance-profile \
    --instance-profile-name SecureWebAppProfile \
    --role-name SecureWebAppRole


Step 6: Automated Verification & Audit
Invoking automated verification Lambda to validate trust scope, permissions boundary enforcement, and policy boundaries:

Terminal
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

Summary of Secure Build Architecture
--------------------------------------------------
1. Strict Trust Boundaries: Restricting the assume-role principal exclusively to ec2.amazonaws.com prevents unauthorized cross-account or identity assumption.
2. Permissions Boundaries: Attaching an explicit permission boundary caps maximum permissions, ensuring even future policy modifications cannot escalate privileges beyond authorized limits.
3. Least Privilege S3 Access: Wildcard actions and resource statements are replaced with explicit action arrays and exact ARN prefixes.
4. Defense-in-Depth Hardening: Integrating VPC conditions (e.g., aws:SourceVpc) alongside IMDSv2 ensures credentials cannot be leveraged outside local network boundaries.
 `,
    sequence: ["Create the new version", "Deploy and observe", "Revoke the old version"]
  },
  {
    title: "AWS IAM Investigation: Identifying Over-Privileged Users & Excessive Grants",
    description: "Auditing IAM identities, evaluating policy documents, identifying over-privileged wildcard access, and enforcing least-privilege principles.",
    category: "SECURITY",
    steps: "7 steps",
    estimate: "14 min",
    state: "Ready",
    image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80",
    detail: ` Phase 1: Environment Setup & Identity Discovery
--------------------------------------------------
Before auditing policies, retrieve and lock down environment context to streamline AWS CLI commands and establish an accurate inventory of IAM users.

Step 1: Initialize Environment Variables
Export the active AWS Account ID into a local variable to simplify IAM Amazon Resource Name (ARN) construction across CLI queries:

Terminal
$ ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

$ echo $ACCOUNT_ID
227184855672

Step 2: Enumerate Account Users
List all IAM user principals created within the target AWS account alongside their creation timestamps:

Terminal
$ aws iam list-users \
    --query "Users[*].[UserName,CreateDate]" \
    --output table

-----------------------------------------------
|                  ListUsers                  |
+---------------+-----------------------------+
|  227184855672 |  2026-03-16T15:32:51+00:00  |
|  carl-the-dev |  2026-03-17T07:03:30+00:00  |
|  ci-deployer  |  2026-03-17T07:03:30+00:00  |
+---------------+-----------------------------+


Phase 2: User Permission Audit & Deep Inspection
--------------------------------------------------
Systematically inspect the user carl-the-dev to evaluate attached managed policies, unmanaged inline policies, and group memberships.

Step 1: Inspect Attached Managed Policies
Query all customer-managed and AWS-managed policies attached directly to carl-the-dev:


Terminal
$ aws iam list-attached-user-policies \
    --user-name carl-the-dev

{
    "AttachedPolicies": [
        {
            "PolicyName": "AWS201-DevCarlAdmin",
            "PolicyArn": "arn:aws:iam::227184855672:policy/AWS201-DevCarlAdmin"
        }
    ]
}

Step 2: Evaluate Managed Policy JSON Document
Retrieve version v1 of the attached policy to inspect statement permissions:

OP User
$ aws iam get-policy-version \
    --policy-arn arn:aws:iam::\${ACCOUNT_ID}:policy/AWS201-DevCarlAdmin \
    --version-id v1

{
    "PolicyVersion": {
        "Document": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "*",
                    "Resource": "*",
                    "Effect": "Allow",
                    "Sid": "OverPrivilegedAccess"
                }
            ]
        },
        "VersionId": "v1",
        "IsDefaultVersion": true,
        "CreateDate": "2026-03-17T07:04:08+00:00"
    }
}

FINDING: "Action": "*" and "Resource": "*" are red flags; the policy grants full unrestricted access to any resource.
Note: A short reminder that policies are evaluated as follows: Explicit Deny -> Explicit Allow -> Implicit Deny

Step 3: Audit for Hidden Inline Policies
Inline policies are embedded directly within a single user identity and do not appear in managed policy listings. Check for inline policies on carl-the-dev:
Info: AWS managed policies are standalone, reusable policies that can be attached to multiple users, groups, or roles. In contrast, inline policies are embedded directly into a single, specific IAM identity, maintaining a strict one-to-one relationship and cannot be shared.


Terminal
$ aws iam list-user-policies \
    --user-name carl-the-dev

{
    "PolicyNames": []
}
FINDING: In this case, no inline policy.

6. Also, check if the user is part of any groups.


OP User
$ aws iam list-groups-for-user \
    --user-name carl-the-dev

{
    "Groups": []
}

[FINDING]: User is not in any group. Direct policy assignment to users makes permission management at scale unmaintainable and violates RBAC standards.

Summary of Audit Findings & Risk Analysis
--------------------------------------------------
1. Over-Privileged Access (Action: *, Resource: *): User carl-the-dev has unrestricted administrative rights. If these credentials are compromised, an attacker gains complete control of the account.
2. Anti-Pattern Assignment: Policies are attached directly to individual users rather than managed through IAM Groups or Roles, causing permission sprawl.
3. Potential Impact Scenarios:
   - Data Destruction: Delete any S3 bucket, RDS database, or EBS snapshot.
   - Defense Evasion: Terminate or tamper with CloudTrail logging.
   - Resource Abuse: Launch unauthorized high-cost EC2 instances.
   - Exfiltration: Read all secrets stored within AWS Secrets Manager and Parameter Store.
 `,
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