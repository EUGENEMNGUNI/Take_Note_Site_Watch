"use client";

import Link from "next/link";
import { useState } from "react";

export default function AdminPage() {
  const [radius, setRadius] = useState(200);
  const [status, setStatus] = useState("Pending");
  const [statusStyle, setStatusStyle] = useState("pill amber");

  const updateRadius = (value: number) => setRadius(value);
  const decide = (nextStatus: string, tone: string) => {
    setStatus(nextStatus);
    setStatusStyle(tone === "green" ? "pill green" : "pill red");
  };

  return (
    <div className="app">
      <aside className="side">
        <div className="logo">TAKE NOTE</div>
        <div className="tag">SITE WATCH</div>

        <a className="nav on" href="#">Dashboard</a>
        <a className="nav" href="#">User management</a>
        <a className="nav" href="#">Role management</a>
        <a className="nav" href="#">Site management</a>
        <a className="nav" href="#">Site assignments</a>
        <a className="nav" href="#">
          Leave requests
          <span className="badge">1</span>
        </a>
        <a className="nav" href="#">Activity history</a>

        <div className="user">
          <b>Admin</b>
          <br />
          Administrator
          <br />
          <Link href="/">Sign out</Link>
        </div>
      </aside>

      <main className="main">
        <div className="top">
          <div>
            <h1>Company overview</h1>
            <span className="small">All sites · Wednesday 7 October</span>
          </div>
          <div>
            <button className="btn outline">New site</button>
            <button className="btn" style={{ marginLeft: 12 }}>Register employee</button>
          </div>
        </div>

        <div className="stats">
          <div className="stat"><b>50</b>Total employees</div>
          <div className="stat"><b className="green">43</b>Checked in</div>
          <div className="stat"><b>7</b>Absent</div>
          <div className="stat"><b style={{ color: "#9a1b1b" }}>3</b>Outside site</div>
          <div className="stat"><b style={{ color: "#1e4fa0" }}>4</b>On leave</div>
          <div className="stat"><b style={{ color: "#9a1b1b" }}>5</b>Open incidents</div>
        </div>

        <div className="grid2" style={{ gridTemplateColumns: "1.2fr 1fr" }}>
          <div className="card">
            <h2>Sites</h2>
            <table>
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Manager</th>
                  <th>Staff</th>
                  <th>Radius</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Company Headquarters</b></td>
                  <td>Nomsa Zulu</td>
                  <td>24</td>
                  <td>200 m</td>
                </tr>
                <tr>
                  <td><b>Warehouse B</b></td>
                  <td>Peter van Wyk</td>
                  <td>15</td>
                  <td>150 m</td>
                </tr>
                <tr>
                  <td><b>North Depot</b></td>
                  <td>Aisha Patel</td>
                  <td>11</td>
                  <td>150 m</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>
              Site rules
              <span className="small">Company Headquarters</span>
            </h2>

            <label>
              Site radius:
              <span id="radiusText">{radius}</span> m
            </label>

            <input type="range" min={50} max={500} value={radius} onChange={(e) => updateRadius(Number(e.target.value))} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label>Work starts</label>
                <input type="time" defaultValue="08:00" />
              </div>
              <div>
                <label>Work ends</label>
                <input type="time" defaultValue="17:00" />
              </div>
            </div>

            <label>Authorised network</label>
            <input defaultValue="Company Wi-Fi" />

            <p className="small" style={{ margin: "8px 0 14px" }}>
              Location is monitored only between the start and end times above.
            </p>

            <button className="btn">Save site rules</button>
          </div>
        </div>

        <div className="grid2" style={{ gridTemplateColumns: "1fr 1.2fr" }}>
          <div className="card">
            <h2>Leave awaiting approval</h2>

            <div style={{ border: "1px solid #e3e0e0", borderRadius: 10, padding: 14 }}>
              <b>Thabo Mokoena</b>
              <span className={statusStyle} style={{ float: "right" }}>{status}</span>
              <br />
              <span className="small">Sick leave · 03/10 to 04/10 · 2 days</span>

              <p style={{ margin: "8px 0" }}>Reason: flu symptoms</p>

              <a href="#">View sick note (sick-note-thabo.pdf)</a>
              <br />
              <br />

              <button className="btn" onClick={() => decide("Approved", "green")}>Approve</button>
              <button className="btn outline" style={{ marginLeft: 10 }} onClick={() => decide("Rejected", "red")}>Reject</button>
            </div>

            <p className="small" style={{ marginTop: 10 }}>Balance after approval: 5 of 10 sick days left</p>
          </div>

          <div className="card">
            <h2>Activity history</h2>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>10:05</td>
                  <td>Nomsa Zulu</td>
                  <td>Updated incident INC-014 to Investigating</td>
                </tr>
                <tr>
                  <td>09:42</td>
                  <td>Sipho Nkosi</td>
                  <td>Reported incident INC-014</td>
                </tr>
                <tr>
                  <td>08:21</td>
                  <td>Thabo Mokoena</td>
                  <td>Submitted leave request</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
