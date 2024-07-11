import { type JobsDataBase } from "./JobsDataBase.ts";

const styles = `

`;

export function indexPage(
  title: string,
  description: string,
  jobsDB: JobsDataBase,
) {
  const jobsTable = jobsDB.allJobs().map((job) =>
    `<tr class="${job.status}"><td>${job.job.id}</td><td>${job.status}</td><td><a href="${job.dir}/log.txt">${job.dir}/log.txt</a></td><td>${job.job.from}</td><td>${job.job.till}</td></tr>`
  );
  return (`
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
    <tr><th>Job ID</th><th>Status</th><th>Log</th><th>From</th><th>Till</th></tr>
    ${jobsTable.join("\n")}
  </table>
</body>
</html>`);
}
