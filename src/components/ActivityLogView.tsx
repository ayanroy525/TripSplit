import React, { useState, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Clock, Filter, PlusCircle, CheckCircle, Trash2, Edit3, UserPlus, Zap } from "lucide-react";
import { Activity, Member } from "../types";
import { C } from "../utils/constants";
import { Avatar, Pill } from "./Atoms";

interface ActivityLogViewProps {
  activities: Activity[];
  members: Member[];
}

export function ActivityLogView({ activities, members }: ActivityLogViewProps) {
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const parentRef = useRef<HTMLDivElement>(null);

  const memberMap = new Map(members.map((m) => [m.name, m]));

  const filteredActivities = activities.filter((act) => {
    if (selectedUser === "all") return true;
    return act.user.toLowerCase() === selectedUser.toLowerCase();
  });

  const rowVirtualizer = useVirtualizer({
    count: filteredActivities.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 6,
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
          {filteredActivities.length > 8 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.teal,
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "var(--c-paperDark)",
                padding: "2px 8px",
                borderRadius: 12,
              }}
            >
              <Zap size={11} color="#F59E0B" />
              Virtualized ({filteredActivities.length})
            </span>
          )}
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

      {/* Timeline items - Virtualized for instant smooth rendering with 200+ logs */}
      <div
        ref={parentRef}
        style={{
          background: C.card,
          border: `1.5px solid ${C.line}`,
          borderRadius: 16,
          padding: "16px 20px",
          maxHeight: "72vh",
          overflowY: "auto",
        }}
      >
        {filteredActivities.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: C.inkSoft }}>
            No activity found for this filter.
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const act = filteredActivities[virtualRow.index];
              const member = memberMap.get(act.user);
              const isLast = virtualRow.index === filteredActivities.length - 1;

              return (
                <div
                  key={act.id || virtualRow.index}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: isLast ? 0 : 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 14,
                      position: "relative",
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
