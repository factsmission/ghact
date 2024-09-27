import { type JobsDataBase } from "./JobsDataBase.ts";

export function indexPage(
  title: string,
  description: string,
  jobsDB: JobsDataBase,
) {
  const jobsTable = jobsDB.allJobs(false, [0, 200]).map((job) =>
    `<tr class="${job.status}"><td>${job.job.id}</td><td>${job.status}</td><td>${job.message || ""}</td><td><a href="${job.dir}/log.txt">${job.dir}/log.txt</a></td><td>${job.job.from}</td><td>${job.job.till}</td></tr>`
  );
  return (`
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
    table {
      border: 2px solid black;
      border-collapse: collapse;
    }
    th,
    td {
      border-bottom: 1px solid;
      border-right: 1px dashed;
      padding: 2px 4px;
    }
    .failed { background: #fcc; }
    .pending { background: #cef; }
    </style>
</head>

<body>
  <h1>${title}</h1>
  <p>${description}</p>
  <table id="jobsTable">
    <tr><th>Job ID</th><th>Status</th><th>Details</th><th>Log</th><th>From</th><th>Till</th></tr>
    ${jobsTable.join("\n")}
  </table>
  <button id="loadall">Load All</button>
  <script>
  const button = document.getElementById("loadall");
  button.addEventListener("click", async () => {
    button.setAttribute("disabled", true);
    const response = await fetch("jobs.json?from=201&till=-1");
    const jobs = await response.json();
    for (const jobStatus of jobs) {
        const row = document.createElement("tr");
        jobsTable.appendChild(row);
        row.classList.add(jobStatus.status);
        row.innerHTML = \`<td>\${jobStatus.job.id}</td><td>\${jobStatus.status}</td><td>\${jobStatus.message || ""}</td><td><a href="\${jobStatus.dir}/log.txt">\${jobStatus.dir}/log.txt</a></td><td>\${jobStatus.job.from}</td><td>\${jobStatus.job.till}</td>\`;
    }
    button.parentElement.removeChild(button);
  });
  </script>
</body>
</html>`);
}
