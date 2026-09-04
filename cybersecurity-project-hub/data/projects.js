
export const projects = [
  {
    title: "CloudFront ",
    description: "Investigation: The EC2 instance allows unauthenticated HTTP GET requests through IMDSv1. The role has an attached over-privileged policy that has broad S3 access. ",
    category: "SECURITY",
    steps: "8 steps",
    estimate: "12 min",
    state: "Ready",
    image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=1200&q=80",
    detail: ``,
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