import React, { useState } from "react";
import { Clock, Filter, PlusCircle, CheckCircle, Trash2, Edit3, UserPlus } from "lucide-react";
import { Activity, Member } from "../types";
import { C } from "../utils/constants";
import { Avatar, Pill } from "./Atoms";

interface ActivityLogViewProps {
  activities: Activity[];
  members: Member[];
}

export function ActivityLogView({ activities, members }: ActivityLogViewProps) {
  const [selectedUser, setSelectedUser] = useState<string>("all");

  const memberMap = new Map(members.map((m) => [m.name, m]));

  const filteredActivities = activities.filter((act) => {
    if (selectedUser === "all") return true;
    return act.user.toLowerCase() === selectedUser.toLowerCase();
  });

  const getActionIcon = (action: string) => {
    if (action.includes("added")) return <PlusCircle size={14} color={C.teal} />;
    if (action.includes("settled") || action.includes("paid"))
      return <CheckCircle size={14} color={C.marigoldDark} />;
    if (action.includes("deleted")) return <Trash2 size={14} color={C.rust} />;
    if (action.includes("updated") || action.includes("edited"))
      return <Edit3 size={14} color={C.marigoldDark} />;
    if (action.includes("member")) return <UserPlus size={14} color="#7B5EA7" />;
    return <Clock size={14} color={C.inkSoft} />;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header & Filter */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={18} color={C.ink} />
          <h3
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 18,
              color: C.ink,
              margin: 0,
            }}
          >
            Audit Activity Trail
          </h3>
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Pill
            active={selectedUser === "all"}
            onClick={() => setSelectedUser("all")}
            tone={C.ink}
          >
            All Activity
          </Pill>
          {members.map((m) => (
            <Pill
              key={m.id}
              active={selectedUser.toLowerCase() === m.name.toLowerCase()}
              onClick={() => setSelectedUser(m.name)}
              tone={m.avatarColor}
            >
              {m.name}
            </Pill>
          ))}
        </div>
      </div>

      {/* Timeline items */}
      <div
        style={{
          background: C.card,
          border: `1.5px solid ${C.line}`,
          borderRadius: 16,
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {filteredActivities.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: C.inkSoft }}>
            No activity found for this filter.
          </div>
        ) : (
          filteredActivities.map((act, index) => {
            const member = memberMap.get(act.user);
            const isLast = index === filteredActivities.length - 1;

            return (
              <div
                key={act.id || index}
                style={{
                  display: "flex",
                  gap: 14,
                  position: "relative",
                  paddingBottom: isLast ? 0 : 20,
                }}
              >
                {/* Vertical connecting line */}
                {!isLast && (
                  <div
                    style={{
                      position: "absolute",
                      left: 17,
                      top: 36,
                      bottom: 0,
                      width: 2,
                      background: C.line,
                    }}
                  />
                )}

                {/* Avatar / Icon */}
                <div style={{ zIndex: 1, flexShrink: 0 }}>
                  <Avatar member={member} size={34} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, paddingTop: 2 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>
                        {act.user}
                      </span>
                      <span style={{ fontSize: 13, color: C.inkSoft }}>{act.action}</span>
                    </div>

                    <span
                      style={{
                        fontSize: 11.5,
                        color: C.inkSoft,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {act.ts}
                    </span>
                  </div>

                  {act.detail && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.ink,
                        background: C.paperDark,
                        padding: "4px 10px",
                        borderRadius: 8,
                        display: "inline-block",
                      }}
                    >
                      {act.detail}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
