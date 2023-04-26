# azure-pipelines-github-actions-hosted-runner-cost-calculator

This is a script/project that was whipped together to help estimate the cost of migrating from Azure DevOps Pipelines to GitHub Actions when using hosted agents/runners.

There are things that ideally would be improved, but it is good enough for the needs of why we created it.

## Setup

- Run `npm ci`
- Create and configure an Azure DevOps personal access token (PAT).
  - It needs the `Agent Pools (Read)` permission.
  - Save the PAT off so you don't lose it.
  - Take the PAT and prepend a `:` to the front of it. Then Base64 encode the value (you could use the [vscode-base64 extension](https://marketplace.visualstudio.com/items?itemName=adamhartford.vscode-base64)). This is the value you need to pass along to the program.
    - For example, if your PAT is `abc123`, then you would Base64 encode `:abc123` which would result in `OmFiYzEyMw==`.

## Run

- Open a terminal window.
- Run a command to set the Azure DevOps organization:
  - `export AZURE_DEVOPS_ORG=<YOUR_ORG>`
- Run a command to set the Azure DevOps PAT:
  - `export AZURE_DEVOPS_PAT=<YOUR_PAT>`
- Run the command to get the pipeline usage specifying, in this order, `azureDevOpsAgentCloudId`, `dateFrom`, and `dateThrough` values:
  - `node main.js <azureDevOpsAgentCloudId> <dateFrom> <dateThrough>`
  - For example:
    - `node main.js 1 2023-01-01 2023-03-31`

## Notes

- Jobs need both `agentConnectedTime` and `releaseRequestTime` values to be included in the stats.
- The "estimate per month" values approximate a monthly cost for the usage between the `dateFrom` and `dateThrough` values.
  - This means that if the range between `dateFrom` and `dateThrough` is only 1 day, it will project what that usage would be over a 30 day period.
  - If the range is actually a 30 day period, it should be a pretty accurate monthly estimate.
- Estimations used with dates
  - The `agentConnectedTime` value cannot be less than the `dateFrom` or greater than the `dateThrough` values.
    - This isn't perfect, but it's close enough for our purposes.
  - Converting to months for "estimate per month" calculations is slightly imprecise given variance in number of days per month.
    - We assume 30 days in a month. However, it's close enough for our purposes.
