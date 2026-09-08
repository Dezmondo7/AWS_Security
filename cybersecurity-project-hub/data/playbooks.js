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

Step 1: Establish baseline context and avoid hardcoding values.
Initial account and instance parameters were stored in local environment variables.


Terminal
$ ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
$ echo "Account_id: \${ACCOUNT_ID}"


Step 2: Enumeration of EC2 Instances.
Next, all running EC2 instances were enumerated to isolate the target workload:


Terminal
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


Step 1: Retrieve and save local environment variables from the target machine.


Terminal
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


Step 2: Enumerate IAM polices including inline policies.
Attached customer-managed and inline IAM policies were enumerated next:


Terminal
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


Terminal
$ aws iam list-role-policies \\
    --role-name \${ROLE_NAME} \\
    --output table

------------------
|ListRolePolicies|
+----------------+

Deep inspection of the default policy version for \`WebAppOverPrivS3Policy\` was performed:


Terminal
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


Terminal
$ aws ssm start-session --target \${INSTANCE_ID}
Starting session with SessionId: 304038454789-o6qvjy5lct8lrak7hlynnnv2oe

sh-5.2$ aws s3 ls
2026-03-24 09:28:41 thm-finance-reports-304038454789
2026-03-24 09:28:41 thm-logs-archive-304038454789
2026-03-24 09:28:41 thm-webapp-data-304038454789

While the web server should only access \`thm-webapp-data\`, the wild-card permissions permitted full access to restricted organizational assets:


Terminal
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


Terminal
sh-5.2$ curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/
WebAppOverPrivRole-304038454789

sh-5.2$ ROLE=$(curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/)
sh-5.2$ curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/\${ROLE}

{
  "Code" : "Success",
  "AccessKeyId" : "ASIAUNSQ2UYCRJQSSR46",
  "SecretAccessKey" : "**************************",
  "Token" : "IQoJb3JpZ2luX2VjENH[...]"
}

Auditing the metadata configuration via EC2 API confirmed IMDS enforcement levels:


Terminal
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


Terminal
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


Terminal
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


Terminal
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


Terminal
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

Step 1: Unauthorized Access Attempt (Finance Bucket):
[Technical Context & Objective]
Access is tested against the sensative bucket (thm-finance-reports-\${ACCOUNT_ID}) to prove that the previously detached over-privileged policy no longer grants unrestricted read permissions across the entire AWS account.

[ Initial Access Test]


Terminal
sh-5.2$ aws s3 ls s3://thm-finance-reports-\${ACCOUNT_ID}/
An error occurred (AccessDenied) when calling the ListObjectsV2 operation. 

Request fails immediatly with an AccessDenied exeption as the newly newly attached scoped policy omits permissions for the thm-finance-reports-* bucket, enforcing an implicit deny.


[ IMDSv2 Token Retrieval & Secondary Test ]
To ensure environment variables inside the SSM session are correctly populated, we dynamically retrieve the AWS Account ID from the EC2 Instance Metadata Service using an IMDSv2 session token, then re-execute the test:


Terminal
sh-5.2$ ACCOUNT_ID=$(curl -s -X PUT "http://169.254.169.254/latest/api/token"     -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" | xargs -I{}     curl -s -H "X-aws-ec2-metadata-token: {}"     http://169.254.169.254/latest/dynamic/instance-identity/document | grep -o '"accountId" : "[^"]*"' | cut -d'"' -f4)

sh-5.2$ aws s3 ls s3://thm-finance-reports-$ACCOUNT_ID/

An error occurred (AccessDenied) when calling the ListObjectsV2 operation: [...]
But the required permissions are applied.

[Verification Verdict]:
PASS — Access to unauthorized resources outside the application scope is strictly blocked.


Step 2: Authorized Access Attempt (App Config Prefix)

[Technical Context & Objective]:
Access is tested against the designated application data bucket path (s3://thm-webapp-data-\${ACCOUNT_ID}/config/) to confirm that legitimate operational access is preserved.


Terminal 
sh-5.2$ aws s3 ls s3://thm-webapp-data-\${ACCOUNT_ID}/config/

2026-03-26 09:06:47         58 app.conf
2026-03-26 09:06:47         44 db.conf [PASS: Access Granted]

[Explanation of Result]:
The command successfully returns the contents of the /config/ prefix (app.conf and db.conf). This confirms that the policy explicitly allows s3:ListBucket on the allowed prefix without breaking application functionality.

[Verification Verdict]:
PASS — Authorized application paths remain fully accessible.


Executing automated compliance validation via AWS Lambda:


Terminal
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
    title: "AWS IAM Investigation: Over-Privileged User",
    description: "Forensic investigation into user policies to indentify over permissive boundaries.",
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

Terminal
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

Also, check if the user is part of any groups.


Terminal
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
    title: "AWS IAM Security Remediation: Over-Privileged User",
    description: "Stripping excessive wildcard IAM administrator policies, authoring a scoped least-privilege policy, enforcing RBAC via IAM Groups, and validating access with the AWS Policy Simulator.",
    category: "FORENSICS",
    steps: "9 steps",
    estimate: "18 min",
    state: "Ready",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&q=80",
    detail: ` Phase 1: Requirements Analysis & Policy Stripping
--------------------------------------------------
To remediate the over-privileged developer identity, we first define the minimum necessary operational requirements for carl-the-dev:
  - Read & List access to S3 objects within the thm-app-data-* bucket
  - Describe EC2 instances
  - Read CloudWatch Logs for debugging


Step 1: Detach Over-Privileged Managed Policy
Sever full administrative access by detaching the customer-managed admin policy directly from the user:


Terminal
$ aws iam detach-user-policy \
    --user-name carl-the-dev \
    --policy-arn arn:aws:iam::\${ACCOUNT_ID}:policy/AWS201-DevCarlAdmin


Step 2: Verify Policy Detachment & Zero-Trust Base
Verify that no direct policies remain attached to the user. With no policy attached, evaluation hits an implicit deny across all services:


Terminal
$ aws iam list-attached-user-policies \
    --user-name carl-the-dev

{
    "AttachedPolicies": []
}

Confirmation: There is no policy attached, the evaluation hits an implicit deny.


Phase 2: Scoped Policy Creation & RBAC Enforcement
--------------------------------------------------
Direct policy assignment to individual users causes permission drift at scale. Remediation enforces Role-Based Access Control (RBAC) by creating an IAM Group and attaching a scoped policy to the group.


Terminal
$ aws iam create-policy \
      --policy-name AppAccess \
      --policy-document '{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "S3AppBucketReadOnly",
               "Effect": "Allow",
                "Action": [
                    "s3:GetObject",
                    "s3:ListBucket"
                ],
                "Resource": [
                    "arn:aws:s3:::thm-app-data-'"$ACCOUNT_ID"'",
                    "arn:aws:s3:::thm-app-data-'"$ACCOUNT_ID"'/*"
                ]
            },
            {
                "Sid": "EC2DescribeOnly",
                "Effect": "Allow",
                "Action": [
                    "ec2:DescribeInstances",
                    "ec2:DescribeSecurityGroups",
                    "ec2:DescribeSubnets",
                    "ec2:DescribeVpcs"
                ],
                "Resource": "*"
            },
            {
                "Sid": "CloudWatchLogsReadOnly",
                "Effect": "Allow",
                "Action": [
                    "logs:DescribeLogGroups",
                    "logs:DescribeLogStreams",
                    "logs:GetLogEvents",
                    "logs:FilterLogEvents"
                ],
                "Resource": "arn:aws:logs:us-east-1:'"$ACCOUNT_ID"':log-group:/aws/app/*"
            }
      ]
  }'

  {
    "Policy": {
        "PolicyName": "AppAccess",
        "PolicyId": "ANPAU2BXNLZOIR6YSLCSO",
        "Arn": "arn:aws:iam::227184855672:policy/CarlAppAccess",
        "Path": "/",
        "DefaultVersionId": "v1",
        "AttachmentCount": 0,
        "PermissionsBoundaryUsageCount": 0,
        "IsAttachable": true,
        "CreateDate": "2026-03-17T11:53:53+00:00",
        "UpdateDate": "2026-03-17T11:53:53+00:00"
    }
}


Step 1: Create Developers IAM Group establishing group to manger developer permissions collectively:


Terminal
$ aws iam create-group \
    --group-name Developers

{
    "Group": {
        "Path": "/",
        "GroupName": "Developers",
        "GroupId": "AGPATJZKFZJ4MP6ST5AUO",
        "Arn": "arn:aws:iam::227184855672:group/Developers",
        "CreateDate": "2026-03-17T10:35:18+00:00"
    }
}


Step 2: Attach Scoped Policy to Group
Attach the scoped AppAccess policy to the developers group:


Terminal
$ aws iam attach-group-policy \
  --group-name Developers \
  --policy-arn "arn:aws:iam::\${ACCOUNT_ID}:policy/AppAccess"

Add the user carl-the-dev to the group.


Terminal
$ aws iam add-user-to-group \
    --group-name Developers \
    --user-name carl-the-dev


Phase 3: Verification & Policy Simulation
--------------------------------------------------
Confirm the new group architecture and validate that expected permissions are allowed while enforcing least privilege.


Step 1: Confirm User Group Membership
Verify carl-the-dev belongs to the Developers group:


Terminal
$ aws iam list-groups-for-user \
    --user-name carl-the-dev

{
    "Groups": [
        {
            "Path": "/",
            "GroupName": "Developers",
            "GroupId": "AGPATJZKFZJ4MP6ST5AUO",
            "Arn": "arn:aws:iam::227184855672:group/Developers",
            "CreateDate": "2026-03-17T10:35:18+00:00"
        }
    ]
}


Step 2: Verify Attached Group Policies
Confirm the group holds the intended scoped policy:


Terminal 
$ aws iam list-attached-group-policies \
    --group-name Developers
{
    "AttachedPolicies": [
        {
            "PolicyName": "AdministratorAccess",
            "PolicyArn": "arn:aws:iam::227184855672:policy/AppAccess"
        }
    ]
}


Step 3: Validate Permissions via AWS Policy Simulator
Extract the attached policy document into a local variable and execute an evaluation simulation against target actions and resources:


Terminal 
$ POLICY_DOC=$(aws iam get-policy-version \
    --policy-arn "arn:aws:iam::\${ACCOUNT_ID}:policy/AppAccess" \
    --version-id v1 \
    --query 'PolicyVersion.Document' --output json)


Step 2: Smulate the policy against the required actions.


Terminal
$ aws iam simulate-custom-policy \
    --policy-input-list "$POLICY_DOC" \
    --action-names "s3:ListBucket" "s3:GetObject" \
    --resource-arns "arn:aws:s3:::thm-app-data-\${ACCOUNT_ID}" \
    --query "EvaluationResults[*].[EvalActionName,EvalDecision]" \
    --output table

------------------------------
|    SimulateCustomPolicy    |
+----------------+-----------+
|  s3:ListBucket |  allowed  |
|  s3:GetObject  |  allowed  |
+----------------+-----------+  


Evaluation Results
The above simulation confirms that the statement logic inside of AppAccess Policy grants permission to list the contents of the target application bucket s3:ListBucket | allowed.
Confirmation that the policy permits reading objects inside the target bucket structure s3:GetObject | allowed.

Summary of Remediation Findings
--------------------------------------------------
1. Least-Privilege Realignment: Over-permissive "Action": "*" permissions were revoked and replaced with explicitly allowed actions required for daily developer workflows.
2. RBAC Management: Transitioned from risky direct-user policy attachments to clean, group-based identity management.
3. Automated Policy Validation: Used aws iam simulate-custom-policy to programmatically verify policy logic prior to production runtime without risking access disruption.
`,
    sequence: ["Create an evidence vault", "Export relevant logs", "Record hashes"]
  },
  {
    title: "AWS IAM Security Secure Build: Over-Privileged User",
    description: "Designing a secure identity architecture utilizing group-based access control, scoped least-privilege policies, and IAM permission boundaries as preventative guardrails. " ,
    category: "GOVERNANCE",
    steps: "5 steps",
    estimate: "11 min",
    state: "Draft",
    image: "/networks.jpg",
    detail: ` Phase 1: Group-Based RBAC & Least-Privilege Policy Deployment
--------------------------------------------------
To manage access securely at scale, permissions are defined by functional roles through IAM Groups rather than direct user assignments. Users inherit permissions dynamically upon joining a group.


Step 1: Create Department-Specific IAM Group
Establish a dedicated group for the Accounting department:


Terminal
$ aws iam create-group --group-name Accounting

{
    "Group": {
        "Path": "/",
        "GroupName": "Accounting",
        "GroupId": "AGPATJZKFZJ4BMVOS2TPL",
        "Arn": "arn:aws:iam::227184855672:group/Accounting",
        "CreateDate": "2026-03-17T10:52:50+00:00"
    }
}


Step 2: Deploy Scoped Least-Privilege Policy
Author and create a custom policy granting strictly required S3 read/write access to the application bucket (thm-app-data-*):


Terminal
$ aws iam create-policy \
  --policy-name AccountingPolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "S3AppAccess",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::thm-app-data-'"$ACCOUNT_ID"'",
                "arn:aws:s3:::thm-app-data-'"$ACCOUNT_ID"'/*"
            ]
        }
    ]
}'

{
    "Policy": {
        "PolicyName": "AccountingPolicy",
        "PolicyId": "ANPAU2BXNLZOOGCCSPW2F",
        "Arn": "arn:aws:iam::227184855672:policy/AccountingPolicy",
        "Path": "/",
        "DefaultVersionId": "v1",
        "AttachmentCount": 0,
        "PermissionsBoundaryUsageCount": 0,
        "IsAttachable": true,
        "CreateDate": "2026-03-17T12:03:52+00:00",
        "UpdateDate": "2026-03-17T12:03:52+00:00"
    }
}


Step 3: Attach Policy to IAM Group
Attach the scoped policy to the Accounting group to enforce RBAC:


Terminal
$ aws iam attach-group-policy \
  --group-name Accounting \
  --policy-arn "arn:aws:iam::\${ACCOUNT_ID}:policy/AccountingPolicy"


  Phase 2: Enforcing Guardrails via Permission Boundaries
--------------------------------------------------
A Permission Boundary is an advanced IAM governance mechanism that sets the maximum permissions an identity can ever achieve, acting as an immutable ceiling that supersedes broader permission grants providing an additional safeguard for key users and roles.

Now, every time a new person joins the Accounting department, and a user is created, you can just add the user to the Accounting group. Similarly, if someone needs their access revoked, you can just remove them from the group.

Permission Boundaries Guardrails
A permission boundary is an IAM policy that sets the maximum permissions an identity can have, superseding other more permissive policies.


Step 1: Create Permission Boundary Policy
Define an explicit boundary document containing explicit Deny statements for sensitive S3 actions:


Terminal
$ aws iam create-policy \
    --policy-name CarlBoundary \
    --policy-document '{
      "Version": "2012-10-17",
      "Statement": [
          {
              "Sid": "DenyCarlActions",
              "Effect": "Deny",
              "Action": [
                  "s3:GetObject",
                  "s3:PutObject",
                  "s3:ListBucket",
                  "s3:DeleteBucket",
                  "s3:ListAllMyBuckets"
              ],
              "Resource": "*"
          }
      ]
  }'

{
    "Policy": {
        "PolicyName": "CarlBoundary",
        "PolicyId": "ANPAU2BXNLZONCQSYI2NM",
        "Arn": "arn:aws:iam::227184855672:policy/CarlBoundary",
        "Path": "/",
        "DefaultVersionId": "v1",
        "AttachmentCount": 0,
        "PermissionsBoundaryUsageCount": 0,
        "IsAttachable": true,
        "CreateDate": "2026-03-17T12:05:46+00:00",
        "UpdateDate": "2026-03-17T12:05:46+00:00"
    }
}


Step 2: Attach Permission Boundary to Identity
Apply the boundary policy to carl-the-dev to restrict maximum allowable scope:


Terminal
$ aws iam put-user-permissions-boundary \
    --user-name carl-the-dev \
    --permissions-boundary "arn:aws:iam::\${ACCOUNT_ID}:policy/CarlBoundary"


Phase 3: Verification & Guardrail Inspection
--------------------------------------------------
Inspect the target user identity to verify that the permission boundary is actively assigned and enforced by the IAM evaluation engine.


Step 1: Verify Attached Permission Boundary
Query the user metadata to confirm the active boundary ARN:


Terminal
$ aws iam get-user \
    --user-name carl-the-dev \
    --query "User.PermissionsBoundary"
{
    "PermissionsBoundaryType": "Policy",
    "PermissionsBoundaryArn": "arn:aws:iam::227184855672:policy/CarlBoundary"
}


Summary of Security Principles Implemented
--------------------------------------------------
1. Group-Based Permission Model: Onboarding and offboarding workflows are centralized at the group level, eliminating permission sprawl and orphan direct-user policies.
2. Scoped Least Privilege: Policies explicitly define allowed API actions, targeted bucket resource ARNs, and path prefixes.
3. Defense-in-Depth Guardrails: Permission Boundaries enforce absolute boundary caps. Even if an attached group policy grants administrator privileges in the future, the boundary ensures high-risk actions remain blocked.
`,
    sequence: ["Define the signal", "Configure the rule", "Test the escalation"]
  },
  
    {
    title: "AWS IAM Security Identification: Silence of the IAM",
    description: "Forensic investigation of an AWS environment with active CloudTrail logging but zero alerting or detection mechanisms for high-risk IAM operations.",
    category: "GOVERNANCE",
    steps: "5 steps",
    estimate: "11 min",
    state: "Draft",
    image: "/matrix.jpg",
    detail: ` Phase 1: Environment Initialization & CloudTrail Status
--------------------------------------------------
Establishing target context and verifying that audit logging is globally active across us-east-1.


Step 1: Save Target AWS Account ID
Store the active account identity in an environment variable to prevent hardcoding:


Terminal
$ ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

$ echo $ACCOUNT_ID


Step 2: Enumerate CloudTrail Trails
Identify active audit trails capturing global service events (IAM operations are globally audited in us-east-1 regardless of source region):


Terminal
$ aws cloudtrail describe-trails \
    --query "trailList[*].{Name:Name,IsMultiRegion:IsMultiRegionTrail,HomeRegion:HomeRegion,GlobalEvents:IncludeGlobalServiceEvents}" \
    --output table

--------------------------------------------------------------------
|                          DescribeTrails                          |
+--------------+-------------+-----------------+-------------------+
| GlobalEvents | HomeRegion  |  IsMultiRegion  |       Name        |
+--------------+-------------+-----------------+-------------------+
|  True        |  us-east-1  |  False          |  lab-audit-trail  |
|  True        |  us-east-1  |  True           |  thm-org-trail    |
+--------------+-------------+-----------------+-------------------+


Step 3: Confirm Active Logging Status
Verify logging health for lab-audit-trail to ensure event telemetry delivery:


Terminal
$ TRAIL_NAME=$(aws cloudtrail describe-trails \
    --query "trailList[0].Name" --output text)

$ aws cloudtrail get-trail-status --name $TRAIL_NAME

{
    "IsLogging": true,
    "LatestDeliveryTime": "2026-03-30T08:40:33.806000+00:00",
    "StartLoggingTime": "2026-03-24T09:41:38.402000+00:00",
    "LatestCloudWatchLogsDeliveryTime": "2026-03-30T09:28:07.702000+00:00",
    "LatestDigestDeliveryTime": "2026-03-30T08:51:05.164000+00:00",
    "LatestDeliveryAttemptTime": "2026-03-30T08:40:33Z",
    "LatestNotificationAttemptTime": "",
    "LatestNotificationAttemptSucceeded": "",
    "LatestDeliveryAttemptSucceeded": "2026-03-30T08:40:33Z",
    "TimeLoggingStarted": "2026-03-24T09:41:38Z",
    "TimeLoggingStopped": ""
}

[FINDING 1]: Audit trail status confirmed active ("IsLogging": true). Logging is verified, but alert triggers are missing.


Phase 2: High-Risk Event Telemetry & Threat Hunting
--------------------------------------------------
Searching for high-risk write/mutation events across IAM telemetry.


Key Risky Operations Reference:
----------------------------------------------------------------------------------
| Event Name             | Risk     | Impact Scenario                            |
+------------------------+----------+--------------------------------------------+
| AttachUserPolicy       | Critical | Direct managed admin escalation           |
| AttachRolePolicy       | Critical | High-privilege role assignment             |
| PutUserPolicy          | Critical | Stealth inline policy creation             |
| CreateUser             | High     | Persistence via new identity creation       |
| CreateAccessKey        | High     | Unmonitored API programmatic persistence    |
| CreateLoginProfile     | High     | Console backdooring for programmatic user  |
| UpdateAssumeRolePolicy | High     | Cross-account role trust exploitation      |
| DeleteTrail/StopLogging| Critical | Defense evasion & trail suppression        |
| DeactivateMFADevice    | High     | Security boundary degradation              |
----------------------------------------------------------------------------------

Step 1: Search for AttachUserPolicy Events
Query CloudTrail lookup-events for recent user policy attachments:


Terminal
$ aws cloudtrail lookup-events \
    --lookup-attributes AttributeKey=EventName,AttributeValue=AttachUserPolicy \
    --max-results 10 \
    --query "Events[*].{Time:EventTime,User:Username,Event:EventName,Resources:Resources[0].ResourceName}" \
    --output table

---------------------------------------------------------------------------------------------
|                                            LookupEvents                                   |
+------------------+---------------+-----------------------------+--------------------------+
|       Event      |   Resources   |            Time             |               User       |
+------------------+---------------+-----------------------------+--------------------------+
|  AttachUserPolicy|  app-deployer |  2026-03-24T09:42:18+00:00  |  Room24-AdminAttach-[...]|
+------------------+---------------+-----------------------------+--------------------------+
[FINDING 2]: Policy attached to user app-deployer by identity Room24-AdminAttach-[...].


Step 2: Search for CreateAccessKey Events
Inspect credential creation events to identify programmatic persistence:


Terminal
$ aws cloudtrail lookup-events \
    --lookup-attributes AttributeKey=EventName,AttributeValue=CreateAccessKey \
    --max-results 10 \
    --query "Events[*].{Time:EventTime,User:Username,Event:EventName,Resources:Resources[0].ResourceName}" \
    --output table

----------------------------------------------------------------------------------------------------
|                                                 LookupEvents                                      |
+-----------------+-----------------------+-----------------------------+---------------------------+
|      Event      |       Resources       |            Time             |           User            |
+-----------------+-----------------------+-----------------------------+---------------------------+
[...]
|  CreateAccessKey|  ******************** |  2026-03-24T09:42:23+00:00  |  [REDACTED]-123456789012  |
[...]
+-----------------+-----------------------+-----------------------------+---------------------------+
[FINDING 3]: Access key generated immediately following policy attachment.


Step 3: Aggregated IAM Write Event Search
Perform a broad event-source query filtering across mutation verbs (Attach, Create, Put, Update, Delete):


Terminal
$ aws cloudtrail lookup-events \
    --lookup-attributes AttributeKey=EventSource,AttributeValue=iam.amazonaws.com \
    --max-results 50 \
    --query "Events[?contains(EventName,'Attach') || contains(EventName,'Create') || contains(EventName,'Put') || contains(EventName,'Update') || contains(EventName,'Delete')].{Time:EventTime,User:Username,Event:EventName}" \
    --output table

--------------------------------------------------------------------------------------------------
|                                            LookupEvents                                        |
+----------------------------+-----------------------------+-------------------------------------+
|            Event           |            Time             |                  User               |
+----------------------------+-----------------------------+-------------------------------------+
[...]
|  CreateAccessKey           |  2026-03-24T09:42:23+00:00  |  [[REDACTED]-123456789012           |
|  AttachUserPolicy          |  2026-03-24T09:42:18+00:00  |  Room24-AdminAttach-123456789012    |
[...]
+----------------------------+-----------------------------+-------------------------------------+
[FINDING 4]: Several suspicious changes should be further investigated.

Inspect Suspicious Changes
In the logs, you should be able to see at least two suspicious events:

AttachUserPolicy event - The AdministratorAccess managed policy was attached directly to a low-privilege user.
CreateAccessKey event - A new key was created for the low-privilege user.
The console details for the AttachUserPolicy event.


Phase 3: Deep Inspection of Suspicious Events
--------------------------------------------------
Extracting raw JSON event metadata from CloudTrail logs to confirm intent, source IPs, and target parameters.


Step 1: Extract AttachUserPolicy Payload
Dump raw log JSON for event verification:


Terminal
$ aws cloudtrail lookup-events \
    --lookup-attributes AttributeKey=EventName,AttributeValue=AttachUserPolicy \
    --max-results 5 \
    --query "Events[0].CloudTrailEvent" \
    --output text | python3 -m json.tool

{
    "eventVersion": "1.11",
    "userIdentity": {
        "type": "AssumedRole",
        "principalId": "AROA00000000000000000:Room24-AdminAttach-123456789012"
    },
    "eventTime": "2026-03-24T09:42:18Z",
    "eventSource": "iam.amazonaws.com",
    "eventName": "AttachUserPolicy",
    "awsRegion": "us-east-1",
    "requestParameters": {
        "userName": "app-deployer",
        "policyArn": "arn:aws:iam::aws:policy/AdministratorAccess"
    }
}

Key Indicators Identified:
- userIdentity - who performed the action.
- requestParameters - which policy ARN was attached to which user.
- sourceIPAddress - where the request originated from.
- eventTime - when it happened.
- Confirm the Current State
- List the attached policies.


Phase 4: Current Identity State Verification
--------------------------------------------------
Cross-referencing live IAM state against CloudTrail logs to confirm persistent access.


Step 1: Verify Attached User Policies
Query current live policy attachments on app-deployer:


Terminal
$ aws iam list-attached-user-policies --user-name app-deployer \
    --query "AttachedPolicies[*].{Policy:PolicyName,ARN:PolicyArn}" --output table

------------------------------------------------------------------------
|                       ListAttachedUserPolicies                       |
+----------------------------------------------+-----------------------+
|                      ARN                     |        Policy         |
+----------------------------------------------+-----------------------+
|  arn:aws:iam::aws:policy/AdministratorAccess |  AdministratorAccess  |
+----------------------------------------------+-----------------------+

CRITICAL FINDING]: User app-deployer maintains unmonitored full AdministratorAccess.


Step 2: Verify Active Programmatic Keys
Enumerate active credentials bound to app-deployer:


Terminal
$ aws iam list-access-keys --user-name app-deployer \
    --query "AccessKeyMetadata[*].{KeyId:AccessKeyId,Status:Status,Created:CreateDate}" --output table

-----------------------------------------------------------------
|                        ListAccessKeys                         |
+----------------------------+------------------------+---------+
|           Created          |         KeyId          | Status  |
+----------------------------+------------------------+---------+
|  2026-03-24T09:42:23+00:00 |  AKIA0000000000000000  |  Active |
+----------------------------+------------------------+---------+

[CRITICAL FINDING]: Active backdoored access key AKIA0000000000000000 confirmed live.


Summary of Investigation Findings
--------------------------------------------------
1. Unauthorized Privilege Escalation: Managed policy AdministratorAccess was assigned directly to low-privilege user app-deployer.
2. Persistence Mechanism: New access key AKIA0000000000000000 created immediately following escalation to establish backdoor programmatic access.
3. Detection Blindspot: While CloudTrail recorded events successfully, the lack of real-time detection/alerting rules permitted stealth exploitation.
 `,
    sequence: ["Define the signal", "Configure the rule", "Test the escalation"]
  },
  {
    title: "AWS IAM Security Remediation: The Silence of the IAM",
    description: "Reverting unauthorized IAM changes, purging backdoor credentials, and building an automated EventBridge-to-SNS pipeline for real-time threat detection.",
    category: "Security",
    steps: "5 steps",
    estimate: "11 min",
    state: "Draft",
    image: "https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=1200&q=80",
    detail: ` Phase 1: Environment Initialization & Context Capture
--------------------------------------------------
Retrieving required AWS account and identity identifiers before initiating rollback.


Step 1: Capture Target Identifiers


Terminal
$ ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

$ ROGUE_KEY_ID=$(aws iam list-access-keys --user-name app-deployer \
    --query "sort_by(AccessKeyMetadata, &CreateDate)[-1].AccessKeyId" \
    --output text)

$ echo "ACCOUNT_ID=$ACCOUNT_ID  ROGUE_KEY_ID=$ROGUE_KEY_ID"


Phase 2: Access Revocation & Backdoor Cleanup
--------------------------------------------------
Detaching AdministratorAccess policy and revoking active backdoored access keys


Step 1: Detach Administrative Policy


Terminal
$ aws iam detach-user-policy \
    --user-name app-deployer \
    --policy-arn arn:aws:iam::aws:policy/AdministratorAccess


Step 2: Verify Policy Detachment


Terminal
$ aws iam list-attached-user-policies --user-name app-deployer --output table

--------------------------
|ListAttachedUserPolicies|
+------------------------+


Step 3: Deactivate and Remove Rogue Credentials

Note: In a real environment, you must verify that the change was not legitimate before rolling it back.


Terminal
$ aws iam update-access-key \
    --user-name app-deployer \
    --access-key-id $ROGUE_KEY_ID \
    --status Inactive

$ aws iam delete-access-key \
    --user-name app-deployer \
    --access-key-id $ROGUE_KEY_ID


Step 4: Verify Credential Erasure


Terminal
$ aws iam list-access-keys --user-name app-deployer --output table

----------------
|ListAccessKeys|
+--------------+


Phase 3: Automated Real-Time Threat Detection Deployment
--------------------------------------------------
Constructing an Amazon EventBridge rule and SNS notification topic to alert on high-risk IAM mutation events.


Step 1: Provision SNS Alert Topic


Terminal 
$ SNS_ARN=$(aws sns create-topic --name iam-change-alerts \
    --query TopicArn --output text)

$ echo $SNS_ARN
arn:aws:sns:us-east-1:569945792897:iam-change-alerts

 
Step 2: Define EventBridge Filter Pattern
Amazon EventBridge is a serverless, event-driven service that enables different services to communicate asynchronously via an event bus.


Terminal
$ aws sns subscribe \
    --topic-arn $SNS_ARN \
    --protocol email \
    --notification-endpoint [REPLACE WITH EMAIL]

{
    "SubscriptionArn": "pending confirmation"
}
    
Check the inbox and confirm the AWS subscription.
Create the event pattern for IAM changes.


Terminal
$ cat > ./iam-event-pattern.json << 'EOF'
{
  "source": ["aws.iam"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventSource": ["iam.amazonaws.com"],
    "eventName": [
      "AttachUserPolicy",
      "AttachRolePolicy",
      "AttachGroupPolicy",
      "PutUserPolicy",
      "PutRolePolicy",
      "PutGroupPolicy",
      "CreateUser",
      "CreateAccessKey",
      "CreateLoginProfile",
      "UpdateAssumeRolePolicy",
      "DeactivateMFADevice",
      "DeleteUser",
      "DeleteAccessKey"
    ]
  }
}
EOF


Step 3: Deploy EventBridge Detection Rule using the pattern defined.


Terminal
$ aws events put-rule \
    --name iam-high-risk-changes \
    --event-pattern file://iam-event-pattern.json \
    --state ENABLED \
    --description "Alerts on high-risk IAM API calls"

{
    "RuleArn": "arn:aws:events:us-east-1:569945792897:rule/iam-high-risk-changes"
}


Step 4: Bind SNS Destination Target


Terminal
$ aws events put-targets \
    --rule iam-high-risk-changes \
    --targets "Id=sns-iam-alerts,Arn=$SNS_ARN"

{
    "FailedEntryCount": 0,
    "FailedEntries": []
}


Step 5: Apply SNS Resource Policy for EventBridge Access
If you perform the previous step in the AWS Console, this policy is automatically added.


Terminal
$ cat > /tmp/iam-topic-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DefaultOwnerAccess",
      "Effect": "Allow",
      "Principal": {"AWS": "*"},
      "Action": [
        "SNS:GetTopicAttributes","SNS:SetTopicAttributes","SNS:AddPermission",
        "SNS:RemovePermission","SNS:DeleteTopic","SNS:Subscribe",
        "SNS:ListSubscriptionsByTopic","SNS:Publish"
      ],
      "Resource": "\${SNS_ARN}",
      "Condition": {"StringEquals": {"AWS:SourceOwner": "\${ACCOUNT_ID}"}}
    },
    {
      "Sid": "AllowEventBridgePublish",
      "Effect": "Allow",
      "Principal": {"Service": "events.amazonaws.com"},
      "Action": "SNS:Publish",
      "Resource": "\${SNS_ARN}"
    }
  ]
}
EOF


Terminal
$ aws sns set-topic-attributes \
  --topic-arn $SNS_ARN \
  --attribute-name Policy \
  --attribute-value file:///tmp/iam-topic-policy.json


Phase 4: Detection Pipeline Verification
--------------------------------------------------
Triggering a controlled event to validate real-time alert dispatching.


Step 1: Trigger Controlled Test Event


Terminal
$ TEST_KEY=$(aws iam create-access-key --user-name app-deployer \
    --query 'AccessKey.AccessKeyId' --output text)

Note: The email might take ~1-3 minutes to land in the inbox.


Step 2: Invoke Automated Remediation Verification
You should clean up the test key.


Terminal
$ aws iam delete-access-key \
    --user-name app-deployer \
    --access-key-id $TEST_KEY

Once everything is set up, you can run the helper Lambda function to fetch your well-earned flag.


Terminal
$ aws lambda invoke \
    --function-name AWS204-VerifyRemediation \
    --payload '{}' \
    /tmp/verify-output.json && python3 -m json.tool /tmp/verify-output.json

[...]
{
    "admin_policy_check": "PASS — AdministratorAccess removed",
    "key_check": "PASS — no active keys (all rogue keys removed)", "status": "PASS",
    "flag": "[REDACTED]"
}

Summary of Remediation Findings
--------------------------------------------------
1. Unauthorized Privilege Escalation Remediation: Successfully revoked the directly attached AdministratorAccess managed policy from low-privilege user app-deployer.
2. Backdoor Persistence Eradication: Identified, deactivated, and deleted active programmatic credentials created during the intrusion window.
3. Automated Real-Time Threat Detection: Closed the visibility gap by deploying an Amazon EventBridge event pattern that captures 13 high-risk IAM mutation calls and dispatches real-time alerts via Amazon SNS.
4. Validation Status: System verification confirmed 0 remaining rogue access keys and zero unmonitored administrative attachments.
 `,
    sequence: ["Define the signal", "Configure the rule", "Test the escalation"]
  },
  {
    title: "AWS IAM Security Secure Build: Engineering an IAM & Defense Evasion Monitoring Baseline ",
    description: "Architecting a multi-tiered security baseline using EventBridge event pattern categorization, CloudTrail defense-evasion detection, and CloudWatch anomaly burst threshold alarms.",
    category: "GOVERNANCE",
    steps: "5 steps",
    estimate: "11 min",
    state: "Draft",
    image: "/lightspeed.jpg",
    detail: ` Phase 1: Environment Initialization & Context Capture
--------------------------------------------------
Establishing target context and mapping destination SNS notification channels.


Step 1: Save Environment Context


Terminal
$ ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

$ SNS_ARN="arn:aws:sns:us-east-1:\${ACCOUNT_ID}:iam-change-alerts"

$ echo "ACCOUNT_ID=$ACCOUNT_ID  SNS_ARN=$SNS_ARN"


Phase 2: Tiered EventBridge Rule Deployment
--------------------------------------------------
Constructing severity-based event patterns to route critical IAM mutations and CloudTrail defense evasion attempts.
It is a good practice to organize the events you want to monitor by severity:

Critical - immediate investigation required:
AttachUserPolicy, AttachRolePolicy, AttachGroupPolicy
PutUserPolicy, PutRolePolicy, PutGroupPolicy
CreateUser
UpdateAssumeRolePolicy
DeleteTrail, StopLogging
PutRetentionPolicy

High - review within 1-2 hours:
CreateAccessKey, CreateLoginProfile, DeactivateMFADevice
DeleteUserPolicy, DetachUserPolicy

Medium - review within 24 hours:
CreateRole, CreateGroup, AddUserToGroup
Create EventBridge Rules
Create separate rules for better routing:

Critical -> direct message/all channels.
High -> Slack.
Medium -> email.


Step 1: Deploy Critical IAM Event Pattern and attach to SNS Topic.


Terminal
$ cat > ./iam-critical-pattern.json << 'EOF'
{
  "source": ["aws.iam"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventSource": ["iam.amazonaws.com"],
    "eventName": [
      "AttachUserPolicy",
      "AttachRolePolicy",
      "AttachGroupPolicy",
      "PutUserPolicy",
      "PutRolePolicy",
      "PutGroupPolicy",
      "CreateUser",
      "UpdateAssumeRolePolicy"
    ]
  }
}
EOF

Create the new rule for the IAM events.


Terminal
$ aws events put-rule \
    --name iam-critical-changes \
    --event-pattern file://iam-critical-pattern.json \
    --state ENABLED \
    --description "Critical IAM changes requiring immediate investigation"

{
    "RuleArn": "arn:aws:events:us-east-1:569945792897:rule/iam-critical-changes"
}

Attach it to the SNS topic.


Terminal
$ aws events put-targets \
    --rule iam-critical-changes \
    --targets "Id=sns-critical,Arn=$SNS_ARN"

{
    "FailedEntryCount": 0,
    "FailedEntries": []
}



Step 2: Deploy CloudTrail Audit Tampering Pattern (Defense Evasion) and add to SNS Topic


Terminal
$ cat > ./audit-tampering-pattern.json << 'EOF'
{
  "source": ["aws.cloudtrail"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventSource": ["cloudtrail.amazonaws.com"],
    "eventName": [
      "DeleteTrail",
      "StopLogging",
      "UpdateTrail",
      "PutEventSelectors"
    ]
  }
}
EOF

Create the log rule.


Terminal
$ aws events put-rule \
    --name audit-trail-tampering \
    --event-pattern file://audit-tampering-pattern.json \
    --state ENABLED \
    --description "Alerts on CloudTrail tampering - defense evasion indicator"

{
    "RuleArn": "arn:aws:events:us-east-1:569945792897:rule/audit-trail-tampering"
}

Add the SNS target.


Terminal
$ aws events put-targets \
    --rule audit-trail-tampering \
    --targets "Id=sns-audit,Arn=$SNS_ARN"

{
    "FailedEntryCount": 0,
    "FailedEntries": []
}

Phase 3: Anomaly Burst Monitoring via CloudWatch
--------------------------------------------------
Establishing log metric filters and threshold alarms to detect high-frequency IAM mutation bursts.
Amazon CloudWatch is a monitoring and observability service that collects, monitors, and analyzes logs, metrics, and events.


Step 1: Create CloudTrail Metric Filter


Terminal
$ aws logs put-metric-filter \
  --log-group-name aws-cloudtrail-logs \
  --filter-name IAMWriteEventCount \
  --filter-pattern '{ ($.eventSource = "iam.amazonaws.com") && (($.eventName = "AttachUserPolicy") || ($.eventName = "CreateUser") || ($.eventName = "CreateAccessKey") || ($.eventName = "PutUserPolicy") || ($.eventName = "AttachRolePolicy") || ($.eventName = "UpdateAssumeRolePolicy")) }' \
  --metric-transformations \
    metricName=IAMHighRiskEventCount,metricNamespace=SecurityMetrics,metricValue=1,defaultValue=0
 
Step 2: Provision Anomaly Burst Alarm (>3 events / 5 min)    
Creates an alarm when more than 3 IAM write events happen within 5 minutes.


Terminal
$ aws cloudwatch put-metric-alarm \
  --alarm-name iam-change-burst \
  --metric-name IAMHighRiskEventCount \
  --namespace SecurityMetrics \
  --statistic Sum \
  --period 300 \
  --threshold 3 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions $SNS_ARN \
  --alarm-description "Alerts when more than 3 high-risk IAM events occur within 5 minutes"


  Phase 4: Monitoring Baseline Verification
--------------------------------------------------
Validating active state across EventBridge, SNS, CloudWatch, and Log Metric Filters.


Step 1: Verify EventBridge Rules


Terminal
$ aws events list-rules \
    --query "Rules[*].{Name:Name,State:State}" --output table

---------------------------------------------------------------------------------
|                                   ListRules                                   |
+--------------------------------------------------------------------+----------+
|                                Name                                |  State   |
+--------------------------------------------------------------------+----------+
[...]
|  audit-trail-tampering                                             |  ENABLED |
|  iam-critical-changes                                              |  ENABLED |
|  iam-high-risk-changes                                             |  ENABLED |
+--------------------------------------------------------------------+----------+


Step 2: Verify SNS Topic Subscriptions


Terminal
$ aws sns list-subscriptions-by-topic \
    --topic-arn $SNS_ARN \
    --query "Subscriptions[*].{Endpoint:Endpoint,Protocol:Protocol}" --output table

------------------------------------------
|        ListSubscriptionsByTopic        |
+---------------------------+------------+
|         Endpoint          | Protocol   |
+---------------------------+------------+
|  hadley.geno@minafter.com |  email     |
+---------------------------+------------+


Step 3: Verify CloudWatch Alarms & Metric Filters
Note: CloudWatch alarms can take 2-10 minutes to transition out of the INSUFFICIENT_DATA state, but this time depends on the alarm's evaluation period and metric type.


Terminal
$ aws cloudwatch describe-alarms \
    --alarm-names iam-change-burst \
    --query "MetricAlarms[*].{Name:AlarmName,State:StateValue,Metric:MetricName}" --output table

--------------------------------------------------------
|                    DescribeAlarms                    |
+------------------------+--------------------+--------+
|         Metric         |       Name         | State  |
+------------------------+--------------------+--------+
|  IAMHighRiskEventCount |  iam-change-burst  |  OK    |
+------------------------+--------------------+--------+


Step 3: Verify CloudWatch Alarms & Metric Filters


Terminal
$ aws logs describe-metric-filters \
  --log-group-name aws-cloudtrail-logs \
  --query "metricFilters[*].{Name:filterName,Pattern:filterPattern}" --output table

-------------------------------------------------------------
|                  DescribeMetricFilters                    |
+---------+-------------------------------------------------+
|  Name   |               IAMWriteEventCount                |
|  Pattern|  [{ ($.eventSource = "iam.amazonaws.com") [...] |
+---------+-------------------------------------------------+


Step 4: Invoke Automated Verification Engine, you can run the helper Lambda function to retrieve the flag.


Terminal
$ aws lambda invoke \
    --function-name AWS204-VerifySecureBuild \
    --payload '{}' \
    /tmp/verify-secure.json && python3 -m json.tool /tmp/verify-secure.json

[...]
{
    "iam-high-risk-changes_check": "PASS — enabled with target", 
    "audit-trail-tampering_check": "PASS — enabled with target",
    "status": "PASS",
    "flag": "[REDACTED]"
}


Summary of Findings & Implementation
--------------------------------------------------
1. Severity-Based Alert Routing: Tiered event pattern logic into Critical (direct notification), High (SIEM/Slack), and Medium levels to eliminate alert fatigue.
2. Anti-Defense Evasion Control: Implemented real-time detection rule audit-trail-tampering monitoring CloudTrail modification calls (DeleteTrail, StopLogging, PutEventSelectors).
3. Anomaly & Burst Detection: Engineered custom CloudWatch Metric Filter (IAMWriteEventCount) coupled with an alarm firing on threshold bursts (>3 critical mutations within 300 seconds).
4. Validation Status: Comprehensive verification passed across all EventBridge rules, CloudWatch alarms, metric filters, and SNS endpoints.
`,
    sequence: ["Define the signal", "Configure the rule", "Test the escalation"]
  },
  {
    title: "Deploy a detective control",
    category: "GOVERNANCE",
    steps: "5 steps",
    estimate: "11 min",
    state: "Draft",
    image: "https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=1200&q=80",
    detail: ` `,
    sequence: ["Define the signal", "Configure the rule", "Test the escalation"]
  },
  {
    title: "Deploy a detective control",
    category: "GOVERNANCE",
    steps: "5 steps",
    estimate: "11 min",
    state: "Draft",
    image: "https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=1200&q=80",
    detail: ` `,
    sequence: ["Define the signal", "Configure the rule", "Test the escalation"]
  },
  {
    title: "Deploy a detective control",
    category: "GOVERNANCE",
    steps: "5 steps",
    estimate: "11 min",
    state: "Draft",
    image: "https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=1200&q=80",
    detail: ` `,
    sequence: ["Define the signal", "Configure the rule", "Test the escalation"]
  },
  {
    title: "Deploy a detective control",
    category: "GOVERNANCE",
    steps: "5 steps",
    estimate: "11 min",
    state: "Draft",
    image: "https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=1200&q=80",
    detail: ` `,
    sequence: ["Define the signal", "Configure the rule", "Test the escalation"]
  },
  {
    title: "Deploy a detective control",
    category: "GOVERNANCE",
    steps: "5 steps",
    estimate: "11 min",
    state: "Draft",
    image: "https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=1200&q=80",
    detail: ` `,
    sequence: ["Define the signal", "Configure the rule", "Test the escalation"]
  },
];