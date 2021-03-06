let transactions = [];
let myChart;

// Get IndexedDB
const request = indexedDB.open("BudgetTracker", 2);
var db;

request.onerror = function(event) {
  console.log("An error has occured with IndexedDB!");
  console.log(event.target.errorCode);
}

request.onsuccess = function(event) {
  db = event.target.result;
}

request.onupgradeneeded = function(event) {
  db = event.target.result;

  let transactionStore = db.createObjectStore("transaction", { autoIncrement: true });

  transactionStore.createIndex("date", "date", { unique: true });
}

// Check for indexedDB and alert the user if features are unavailable
if (!window.indexedDB) {
  console.log("Your browser doesn't support a stable version of IndexedDB. Offline budget tracking will not be available.");
}

fetch("/api/transaction")
  .then(response => {
    return response.json();
  })
  .then(data => {
    // save db data on global variable
    transactions = data;
  })
  .then(() => {
    // Check indexedDB and send over any unsettled transactions
    const t = db.transaction(["transaction"], "readwrite");
    
    var transactionStore = t.objectStore("transaction");

    // Get all transactions in IndexedDB
    let offlineTransactions = transactionStore.getAll();
    offlineTransactions.onsuccess = function(event) {
      // Add each transaction to the mongodb database
      fetch("/api/transaction/bulk", {
        method: "POST",
        body: JSON.stringify(event.target.result),
        headers: {
          "Content-Type": "application/json"
        }
      });

      transactionStore.clear();
      transactions = [
        ...transactions,
        ...event.target.result
      ]

      // Sorting the array in case some offline results are not most recent.
      transactions.sort((el1, el2) => {
        return new Date(el2.date) - new Date(el1.date);
      })

      populateTotal();
      populateTable();
      populateChart();
    }
  })
  .then(() => {
    // Render the transactions to the page
    populateTotal();
    populateTable();
    populateChart();
  }); 



function populateTotal() {
  // reduce transaction amounts to a single total value
  let total = transactions.reduce((total, t) => {
    return total + parseInt(t.value);
  }, 0);

  let totalEl = document.querySelector("#total");
  totalEl.textContent = total;
}

function populateTable() {
  let tbody = document.querySelector("#tbody");
  tbody.innerHTML = "";

  transactions.forEach(transaction => {
    // create and populate a table row
    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${transaction.name}</td>
      <td>${transaction.value}</td>
    `;

    tbody.appendChild(tr);
  });
}

function populateChart() {
  // copy array and reverse it
  let reversed = transactions.slice().reverse();
  let sum = 0;

  // create date labels for chart
  let labels = reversed.map(t => {
    let date = new Date(t.date);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  });

  // create incremental values for chart
  let data = reversed.map(t => {
    sum += parseInt(t.value);
    return sum;
  });

  // remove old chart if it exists
  if (myChart) {
    myChart.destroy();
  }

  let ctx = document.getElementById("myChart").getContext("2d");

  myChart = new Chart(ctx, {
    type: 'line',
      data: {
        labels,
        datasets: [{
            label: "Total Over Time",
            fill: true,
            backgroundColor: "#6666ff",
            data
        }]
    }
  });
}

function sendTransaction(isAdding) {
  let nameEl = document.querySelector("#t-name");
  let amountEl = document.querySelector("#t-amount");
  let errorEl = document.querySelector(".form .error");

  // validate form
  if (nameEl.value === "" || amountEl.value === "") {
    errorEl.textContent = "Missing Information";
    return;
  }
  else {
    errorEl.textContent = "";
  }

  // create record
  let transaction = {
    name: nameEl.value,
    value: amountEl.value,
    date: new Date().toISOString()
  };

  // if subtracting funds, convert amount to negative number
  if (!isAdding) {
    transaction.value *= -1;
  }

  // add to beginning of current array of data
  transactions.unshift(transaction);

  // re-run logic to populate ui with new record
  populateChart();
  populateTable();
  populateTotal();
  
  // also send to server
  fetch("/api/transaction", {
    method: "POST",
    body: JSON.stringify(transaction),
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json"
    }
  })
  .then(response => {    
    return response.json();
  })
  .then(data => {
    if (data.errors) {
      errorEl.textContent = "Missing Information";
    }
    else {
      // clear form
      nameEl.value = "";
      amountEl.value = "";
    }
  })
  .catch(err => {
    // fetch failed, so save in indexed db
    saveRecord(transaction);

    // clear form
    nameEl.value = "";
    amountEl.value = "";
  });
}

// Add a transaction to the indexedDB
function saveRecord(transaction) {
  // Open a new IndexedDB transaction
  var t = db.transaction(["transaction"], "readwrite");
  t.oncomplete = function(event) {
    console.log("transaction saved.");
  }
  t.onerror = function(event) {
    console.log("Something went wrong!");
    console.log(event.target.errorCode);
  }

  var transactionStore = t.objectStore("transaction");
  transactionStore.add(transaction);
}

document.querySelector("#add-btn").onclick = function() {
  sendTransaction(true);
};

document.querySelector("#sub-btn").onclick = function() {
  sendTransaction(false);
};
