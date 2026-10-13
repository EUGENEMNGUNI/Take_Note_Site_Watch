"use client";

import Link from "next/link";
import { useState } from "react";

export default function EmployeePage() {
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkMessage, setCheckMessage] = useState(
    "If you are off the company network, check-in is unavailable."
  );

  const handleCheckIn = () => {
    setCheckedIn(true);
    setCheckMessage(`You checked in at ${new Date().toTimeString().slice(0, 5)}`);
  };

  return (
    <div className="app">
      <aside className="side">
        <div className="logo">TAKE NOTE</div>
        <div className="tag">SITE WATCH</div>
        <a className="nav on" href="#">Home</a>
        <a className="nav" href="#leave">Leave</a>
        <a className="nav" href="#report">Report</a>
        <div className="user">
          <b>Thabo Mokoena</b>
          <br />
          Employee
          <br />
          <Link href="/">Sign out</Link>
        </div>
      </aside>

      <main className="main">
        <p className="small">Wednesday 7 October</p>
        <h1>Good morning, Thabo</h1>
        <br />

        <div className="grid2">
          <div className="card">
            <h2>
              My site: Company Headquarters
              <span className="pill green" style={{ marginLeft: 12 }}>Within site</span>
            </h2>

            <table>
              <tbody>
                <tr>
                  <td>Signed in</td>
                  <td className="green">Verified</td>
                </tr>
                <tr>
                  <td>Company network</td>
                  <td className="green">Connected</td>
                </tr>
                <tr>
                  <td>Distance from site centre</td>
                  <td>42 m of 200 m</td>
                </tr>
                <tr>
                  <td>Working hours</td>
                  <td>08:00 to 17:00</td>
                </tr>
              </tbody>
            </table>

            <br />
            <button className="btn" onClick={handleCheckIn} style={{ width: "100%" }} disabled={checkedIn}>
              {checkedIn ? "Checked in" : "Check in"}
            </button>
            <p className="small" style={{ marginTop: 10 }}>{checkMessage}</p>
          </div>

          <div className="card">
            <h2>
              My tasks today
              <span className="small" style={{ marginLeft: 12 }}>3 open</span>
            </h2>

            <div className="task">
              Inspect server room
              <span className="pill red" style={{ float: "right" }}>High</span>
              <br />
              <span className="small">Due 14:00 · Pending</span>
            </div>

            <div className="task">
              Check extinguisher tags, Bay 1
              <span className="pill amber" style={{ float: "right" }}>Medium</span>
              <br />
              <span className="small">Due 15:30 · In progress</span>
            </div>

            <div className="task done">
              <b>Morning equipment check</b>
              <span className="pill green" style={{ float: "right" }}>Done</span>
              <br />
              <span className="small">Completed 09:10</span>
            </div>
          </div>
        </div>

        <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="card" id="leave">
            <h2>Leave</h2>
            <p className="small">Sick leave: 7 days left, 3 used</p>

            <label>Leave type</label>
            <select>
              <option>Sick leave</option>
              <option>Annual leave</option>
            </select>

            <label>Start date</label>
            <input type="date" />

            <label>End date</label>
            <input type="date" />

            <label>Reason</label>
            <textarea rows={2} placeholder="Briefly describe the reason" />

            <label>Sick note</label>
            <input type="file" />
            <br />
            <button className="btn">Submit request</button>
          </div>

          <div className="card" id="report">
            <h2>Report an incident</h2>
            <p className="small">Your Site Manager is notified as soon as you submit.</p>

            <label>What happened</label>
            <select>
              <option>Hazard</option>
              <option>Accident</option>
            </select>

            <label>Priority</label>
            <select>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>

            <label>Details</label>
            <textarea rows={3} placeholder="Describe the hazard or accident" />
            <br />
            <button className="btn">Submit report</button>
          </div>
        </div>
      </main>
    </div>
  );
}
