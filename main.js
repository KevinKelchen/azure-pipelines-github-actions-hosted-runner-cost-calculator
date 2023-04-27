const axios = require('axios').default;
const lodash = require('lodash');

// Example usage:
// export AZURE_DEVOPS_ORG=<YOUR_ORG>
// export AZURE_DEVOPS_PAT=<YOUR_PAT>
// node main.js 1 2023-01-01 2023-03-31

const azureDevOpsOrg = process.env.AZURE_DEVOPS_ORG;
const azureDevOpsPAT = process.env.AZURE_DEVOPS_PAT;

const azureDevOpsAgentCloudIdArg = process.argv[2];
const dateFromArg = process.argv[3];
const dateThroughArg = process.argv[4];

const main = async () => {
  validateEnvVars(azureDevOpsOrg, azureDevOpsPAT);

  const { azureDevOpsAgentCloudId, dateFrom, dateThrough } = parseArguments(azureDevOpsAgentCloudIdArg, dateFromArg, dateThroughArg);

  const jobList = await getJobList(azureDevOpsOrg, azureDevOpsPAT, azureDevOpsAgentCloudId);

  const usageByImage = getUsageByImage(jobList, dateFrom, dateThrough);
  logUsageByImage(usageByImage);

  logJobCounts(jobList, usageByImage);

  const usageByOSCategory = getUsageByOSCategory(usageByImage);
  logUsageByOSCategory(usageByOSCategory);

  const usageByOSCategoryEstimatePerMonth = getUsageByOSCategoryEstimatePerMonth(usageByOSCategory, dateFrom, dateThrough);
  logUsageByOSCategoryEstimatePerMonth(usageByOSCategoryEstimatePerMonth);

  const totalCostEstimatePerMonth = getTotalCostEstimatePerMonth(usageByOSCategoryEstimatePerMonth);
  logTotalCostEstimatePerMonth(totalCostEstimatePerMonth);
};

const log = (...args) => {
  console.log(...args);
  console.log();
};

const validateEnvVars = (azureDevOpsOrg, azureDevOpsPAT) => {
  if (!azureDevOpsOrg)
    throw new Error("Please set the AZURE_DEVOPS_ORG environment variable.");

  if (!azureDevOpsPAT)
    throw new Error("Please set the AZURE_DEVOPS_PAT environment variable.");
};

const parseArguments = (azureDevOpsAgentCloudIdArg, dateFromArg, dateThroughArg) => {
  if (!azureDevOpsAgentCloudIdArg)
    throw new Error("Please provide an azureDevOpsAgentCloudId argument.");

  if (!dateFromArg || !dateThroughArg)
    throw new Error("Please provide a dateFrom and dateThrough argument.");

  const dateFrom = new Date(dateFromArg);
  const dateThrough = new Date(dateThroughArg);

  return { azureDevOpsAgentCloudId: azureDevOpsAgentCloudIdArg, dateFrom, dateThrough };
};

const getJobList = async (azureDevOpsOrg, azureDevOpsPAT, azureDevOpsAgentCloudId) => {
  // See https://learn.microsoft.com/en-us/rest/api/azure/devops/distributedtask/requests/list?view=azure-devops-rest-7.0
  const response = await axios.get(`https://dev.azure.com/${azureDevOpsOrg}/_apis/distributedtask/agentclouds/${azureDevOpsAgentCloudId}/requests?api-version=7.0`, {
    headers: {
      "Authorization": `Basic ${azureDevOpsPAT}`,
    }
  });

  return response.data;
};

const getUsageByImage = (jobList, dateFrom, dateThrough) => {
  const usageByImage = new Map();

  for (const item of jobList.value) {
    const vmImage = item.agentSpecification?.vmImage ?? item.agentSpecification?.VMImage;

    if (!vmImage) {
      // log(`Item has no vmImage, so skipping: ${JSON.stringify(item)}`);
      continue;
    }

    if (!item.agentConnectedTime || !item.releaseRequestTime) {
      // log(`Item has no agentConnectedTime or releaseRequestTime, so skipping: ${JSON.stringify(item)}`);
      continue;
    }

    const connectedTime = new Date(item.agentConnectedTime);
    const releaseTime = new Date(item.releaseRequestTime);

    // This isn't perfect, but it's close enough for our purposes.
    if (connectedTime < dateFrom || connectedTime > dateThrough) {
      // log(`Item has a connectedTime outside of our inclusion window, so skipping: ${JSON.stringify(item)}`);
      continue;
    }

    // Convert from milliseconds to seconds to minutes.
    const durationInMinutes = lodash.round(Math.abs(releaseTime - connectedTime) / 1000 / 60);

    const currentValue = usageByImage.get(vmImage) ?? { jobCount: 0, durationInMinutes: 0 };

    usageByImage.set(vmImage, { jobCount: currentValue.jobCount + 1, durationInMinutes: currentValue.durationInMinutes + durationInMinutes });
  }

  return usageByImage;
};

const logUsageByOSCategory = (usageByOSCategory) => {
  log("Usage by OS Category:", usageByOSCategory);
};

const logJobCounts = (jobList, usageByImage) => {
  let jobCount = 0;

  for (const [_key, value] of usageByImage) {
    jobCount += value.jobCount;
  }

  log(`Job count in all data: ${jobList.count}`);
  log(`Job count included: ${jobCount}`);
};

const getUsageByOSCategory = (usageByImage) => {
  const usageByOSCategory = new Map();

  for (const [key, value] of usageByImage) {
    const imageLowerCase = key.toLowerCase();

    let osCategory;

    if (imageLowerCase.includes("win") || imageLowerCase.includes("vs"))
      osCategory = "Windows";
    else if (imageLowerCase.includes("mac"))
      osCategory = "macOS";
    else if (imageLowerCase.includes("ubuntu"))
      osCategory = "Ubuntu";

    if (!osCategory)
      throw new Error(`Unknown OS category for image: ${key}`);

    const currentValue = usageByOSCategory.get(osCategory) ?? { jobCount: 0, durationInMinutes: 0 };

    usageByOSCategory.set(osCategory, { jobCount: currentValue.jobCount + value.jobCount, durationInMinutes: currentValue.durationInMinutes + value.durationInMinutes });
  }

  return usageByOSCategory;
};

const logUsageByImage = (usageByImage) => {
  log("Usage by image:", usageByImage);
};

const getUsageByOSCategoryEstimatePerMonth = (usageByOSCategory, dateFrom, dateThrough) => {
  const usageByOSCategoryEstimatePerMonth = new Map();

  for (const [key, value] of usageByOSCategory) {
    let costPerMinute;

    if (key === "Windows")
      costPerMinute = 0.016;
    else if (key === "macOS")
      costPerMinute = 0.08;
    else if (key === "Ubuntu")
      costPerMinute = 0.008;

    if (!costPerMinute)
      throw new Error(`Unknown OS category: ${key}`);

    // Convert from milliseconds to seconds to minutes to hours to days to months.
    // Acknowledge that converting to months is slightly imprecise given variance in
    // number of days per month, but it's close enough for our purposes.
    const monthsInDateRange = Math.abs(dateThrough - dateFrom) / 1000 / 60 / 60 / 24 / 30;

    const durationInMinutesEstimatePerMonth = lodash.round(value.durationInMinutes / monthsInDateRange);
    const costEstimatePerMonth = lodash.round(durationInMinutesEstimatePerMonth * costPerMinute, 2);

    usageByOSCategoryEstimatePerMonth.set(key, { ...value, durationInMinutesEstimatePerMonth: durationInMinutesEstimatePerMonth, costPerMinute, costEstimatePerMonth: costEstimatePerMonth });
  }

  return usageByOSCategoryEstimatePerMonth;
};

const logUsageByOSCategoryEstimatePerMonth = (usageByOSCategoryEstimatePerMonth) => {
  log("Usage by OS Category Per Month:", usageByOSCategoryEstimatePerMonth);
};

const getTotalCostEstimatePerMonth = (usageByOSCategoryEstimatePerMonth) => {
  let totalCostEstimatePerMonth = 0;

  for (const [_key, value] of usageByOSCategoryEstimatePerMonth) {
    totalCostEstimatePerMonth += value.costEstimatePerMonth;
  }

  return lodash.round(totalCostEstimatePerMonth, 2);
};

const logTotalCostEstimatePerMonth = (totalCostEstimatePerMonth) => {
  log(`Total cost estimate per month: ${totalCostEstimatePerMonth}`);
};

(async () => {
  await main();
})();
