export function indexPage(title: string, description: string) {
  const styles = `
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

.failed {
    background: #fcc;
}

.pending {
    background: #cef;
}`;
  const script = `const response = await fetch("jobs.json");
  const jobs = await response.json();
  for (const jobStatus of jobs) {
      const row = document.createElement("tr");
      jobsTable.appendChild(row);
      row.classList.add(jobStatus.status);
      row.innerHTML = \`<td>\${jobStatus.job.id}</td><td>\${jobStatus.status}</td><td><a href="\${jobStatus.dir}/log.txt">\${jobStatus.dir}/log.txt</a></td><td>\${jobStatus.job.from}</td><td>\${jobStatus.job.till}</td>\`;
  }`;
  return (`
    <html>
      <head>
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        <title>${title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>${styles}</style>
      </head>

      <body>
        <h1>${title}</h1>
        <p>${description}</p>
        <table id="jobsTable">
          <tr>
            <th>Job ID</th>
            <th>Status</th>
            <th>Log</th>
            <th>From</th>
            <th>Till</th>
          </tr>
        </table>
        <script type="module">${script}</script>
      </body>
    </html>`);
}
