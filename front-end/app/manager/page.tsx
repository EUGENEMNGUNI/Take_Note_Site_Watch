"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getStoredUserEmail, signOut } from "@/lib/auth";
import { RoleGuard } from "@/components/role-guard";

export default function ManagerPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [displayName, setDisplayName] = useState("Site Manager");
  const [signOutMessage, setSignOutMessage] = useState("");

  useEffect(() => {
    const email = getStoredUserEmail();
    setDisplayName(email ? email.split("@")[0].replace(/[._-]/g, " ") : "Site manager");
  }, []);

  const pageTitle = useMemo(() => {
    if (activeTab === "tasks") return "Tasks";
    if (activeTab === "incidents") return "Incidents";
    return "Dashboard";
  }, [activeTab]);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/");
    } catch (error) {
      setSignOutMessage(
        error instanceof Error ? error.message : "Could not sign out. Please try again.",
      );
    }
  };

  return (
    <RoleGuard allowedRoles={["manager"]}>
      <div className="app">
        <aside className="side">
          <div className="logo">TAKE NOTE</div>
          <div className="tag">SITE WATCH</div>
          <button type="button" className={`nav ${activeTab === "dashboard" ? "on" : ""}`} onClick={() => setActiveTab("dashboard")}>Dashboard</button>
          <button type="button" className="nav" onClick={() => setActiveTab("dashboard")}>Employees</button>
          <button type="button" className="nav" onClick={() => setActiveTab("dashboard")}>Check-ins log</button>
          <button type="button" className={`nav ${activeTab === "tasks" ? "on" : ""}`} onClick={() => setActiveTab("tasks")}>
            Tasks <span className="badge">9</span>
          </button>
          <button type="button" className={`nav ${activeTab === "incidents" ? "on" : ""}`} onClick={() => setActiveTab("incidents")}>
            Incidents <span className="badge" style={{ background: "#fadcdc", color: "#9a1b1b" }}>3</span>
          </button>
          <button type="button" className="nav" onClick={() => setActiveTab("dashboard")}>Messages</button>
          <div className="user">
            <b>{displayName}</b>
            <br />
            Site Manager
            <br />
            <button type="button" className="link-button" onClick={handleSignOut}>Sign out</button>
            {signOutMessage ? <div className="message error" role="alert">{signOutMessage}</div> : null}
          </div>
        </aside>

        <main className="main">
          <div className="top">
            <div>
              <h1>{activeTab === "dashboard" ? "Company Headquarters" : pageTitle}</h1>
              <span className="small">Wednesday 7 October · 10:13</span>
            </div>
            <div>
              <span className="pill green">Monitoring on · ends 17:00</span>
              <button className="btn" style={{ marginLeft: 12 }} onClick={() => setActiveTab("tasks")}>New task</button>
            </div>
          </div>

        {activeTab === "dashboard" && (
          <>
            <div className="stats">
              <div className="stat"><b>24</b>Assigned staff</div>
              <div className="stat"><b className="green">21</b>Checked in</div>
              <div className="stat"><b style={{ color: "#9a1b1b" }}>2</b>Outside site</div>
              <div className="stat"><b style={{ color: "var(--amber)" }}>2</b>Late today</div>
              <div className="stat"><b>9</b>Open tasks</div>
              <div className="stat"><b style={{ color: "#9a1b1b" }}>3</b>Open incidents</div>
            </div>

            <div className="grid2">
              <div className="card">
                <h2>Live site map</h2>
                <div className="map">
                  <div className="zone" />
                  <div className="hq">HQ building</div>
                  <div className="dot" style={{ background: "#157a45", left: "40%", top: "30%" }} />
                  <div className="dot" style={{ background: "#157a45", left: "58%", top: "38%" }} />
                  <div className="dot" style={{ background: "#157a45", left: "44%", top: "72%" }} />
                  <div className="dot" style={{ background: "#157a45", left: "55%", top: "78%" }} />
                  <div className="dot" style={{ background: "#e08a00", left: "66%", top: "56%" }} />
                  <div className="dot" style={{ background: "#9a1b1b", left: "8%", top: "12%" }} />
                  <div className="dot" style={{ background: "#9a1b1b", left: "88%", top: "86%" }} />
                  <div className="dot" style={{ background: "#16171b", left: "48%", top: "18%", borderRadius: 2, transform: "rotate(45deg)" }} />
                </div>
                <p className="small" style={{ marginTop: 8 }}>Site radius 200 m · Green: within site · Orange: near boundary · Red: outside site · Black: open incident</p>
              </div>

              <div className="card">
                <h2>Alerts <span className="small">5 new</span></h2>
                <table>
                  <tbody>
                    <tr>
                      <td>
                        <b>Thabo Mokoena is outside the site radius</b>
                        <br />
                        <span className="small">11:00 · 340 m from centre</span>
                      </td>
                      <td><a href="#">Message</a></td>
                    </tr>
                    <tr>
                      <td>
                        <b>High priority incident: water leak, Bay 3</b>
                        <br />
                        <span className="small">09:42 · Sipho Nkosi</span>
                      </td>
                      <td><a href="#" onClick={() => setActiveTab("incidents")}>Open</a></td>
                    </tr>
                    <tr>
                      <td><b>Late check-in: Maria Santos at 08:27</b></td>
                      <td></td>
                    </tr>
                    <tr>
                      <td>
                        <b>John Dlamini has not checked in today</b>
                        <br />
                        <span className="small">Shift started 08:00</span>
                      </td>
                      <td><a href="#">Call</a></td>
                    </tr>
                    <tr>
                      <td>
                        <b>New sick-leave request from Thabo Mokoena</b>
                        <br />
                        <span className="small">Sent to administrator</span>
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h2>Latest check-ins</h2>
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Checked in</th>
                    <th>Site</th>
                    <th>Presence</th>
                    <th>Open tasks</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><b>Thabo Mokoena</b></td>
                    <td>07:55</td>
                    <td>Company Headquarters</td>
                    <td><span className="pill red">Outside site</span></td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td><b>Maria Santos</b></td>
                    <td>08:27</td>
                    <td>Company Headquarters</td>
                    <td><span className="pill green">Within site</span></td>
                    <td>2</td>
                  </tr>
                  <tr>
                    <td><b>Lerato Khumalo</b></td>
                    <td>07:48</td>
                    <td>Company Headquarters</td>
                    <td><span className="pill amber">Near boundary</span></td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td><b>Sipho Nkosi</b></td>
                    <td>07:51</td>
                    <td>Company Headquarters</td>
                    <td><span className="pill red">Outside site</span></td>
                    <td>2</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "tasks" && (
          <div>
            <h1>Tasks</h1>
            <p className="small" style={{ marginBottom: 16 }}>Company Headquarters · 9 open, 2 completed today</p>

            <div className="card" style={{ marginBottom: 18 }}>
              <h2>Create and assign a task</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                <div>
                  <label>Task</label>
                  <input placeholder="e.g. Inspect server room" />
                </div>
                <div>
                  <label>Assign to</label>
                  <select>
                    <option>Thabo Mokoena</option>
                    <option>Maria Santos</option>
                    <option>Lerato Khumalo</option>
                    <option>Sipho Nkosi</option>
                  </select>
                </div>
                <div>
                  <label>Priority</label>
                  <select>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 16 }}><button className="btn">Assign task</button></div>
            </div>

            <div className="card">
              <h2>Open task list</h2>
              <table>
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Owner</th>
                    <th>Priority</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Inspect server room</td><td>Thabo Mokoena</td><td><span className="pill red">High</span></td><td>14:00</td><td>Pending</td></tr>
                  <tr><td>Check extinguisher tags</td><td>Maria Santos</td><td><span className="pill amber">Medium</span></td><td>15:30</td><td>In progress</td></tr>
                  <tr><td>Review site signage</td><td>Lerato Khumalo</td><td><span className="pill blue">Low</span></td><td>16:00</td><td>Scheduled</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "incidents" && (
          <div>
            <h1>Incidents</h1>
            <p className="small" style={{ marginBottom: 16 }}>3 open incidents · 1 critical</p>

            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Incident</th>
                    <th>Reported by</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Water leak in Bay 3</td><td>Sipho Nkosi</td><td><span className="pill red">High</span></td><td>Investigating</td><td>Warehouse</td></tr>
                  <tr><td>Fence gate left ajar</td><td>Maria Santos</td><td><span className="pill amber">Medium</span></td><td>Monitoring</td><td>Main gate</td></tr>
                  <tr><td>Temporary trip hazard near store room</td><td>Thabo Mokoena</td><td><span className="pill blue">Low</span></td><td>Actioned</td><td>Bay 2</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
    </RoleGuard>
  );
}
