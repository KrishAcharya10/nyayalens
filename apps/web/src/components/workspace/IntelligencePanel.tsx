"use client";

import { useEffect, useState } from "react";
import type {
  DocumentClause,
  DocumentDetail,
  DocumentGraph,
  Entity,
  GraphNode,
  Risk,
} from "@/lib/apiTypes";
import { getGraph } from "@/lib/api";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { OverviewTab } from "./OverviewTab";
import { EntityTab } from "./EntityTab";
import { ClauseTab } from "./ClauseTab";
import { RiskPanel } from "./RiskPanel";
import { GraphView } from "./GraphView";
import { AskPanel } from "./AskPanel";

type TabId = "overview" | "entities" | "clauses" | "risks" | "graph" | "ask";

// A graph node's id is namespaced by type ("entity:<id>", "clause:<id>",
// "risk:<id>", "document:<id>" - see apps/api/src/graph/buildGraph.ts).
function parseGraphNodeId(id: string): { type: string; rawId: string } {
  const [type, ...rest] = id.split(":");
  return { type: type ?? "", rawId: rest.join(":") };
}

export function IntelligencePanel({
  document,
  entities,
  clauses,
  risks,
}: {
  document: DocumentDetail;
  entities: Entity[];
  clauses: DocumentClause[];
  risks: Risk[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [graph, setGraph] = useState<DocumentGraph | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== "graph" || graph) return;
    getGraph(document.id)
      .then(setGraph)
      .catch((err: unknown) =>
        setGraphError(err instanceof Error ? err.message : "Could not load graph"),
      );
  }, [activeTab, graph, document.id]);

  // Section 18: clicking a graph node opens its detail in the SAME
  // intelligence panel used elsewhere - it switches to the relevant tab
  // and highlights the exact card there, rather than rendering a second,
  // inconsistent detail view.
  function handleSelectGraphNode(node: GraphNode) {
    const { type, rawId } = parseGraphNodeId(node.id);
    setHighlightId(rawId);
    if (type === "entity") setActiveTab("entities");
    else if (type === "clause") setActiveTab("clauses");
    else if (type === "risk") setActiveTab("risks");
    else setActiveTab("overview");
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        tabs={[
          { id: "overview", label: "Overview" },
          {
            id: "entities",
            label: "Entities",
            count: entities.filter((e) => e.modelSource === "RULE_BASED").length,
          },
          {
            id: "clauses",
            label: "Clauses",
            count: clauses.filter((c) => c.modelSource === "RULE_BASED").length,
          },
          {
            id: "risks",
            label: "Risks",
            count: risks.filter((r) => r.modelSource === "RULE_BASED").length,
          },
          { id: "graph", label: "Graph" },
          { id: "ask", label: "Ask" },
        ]}
      />
      <TabPanel id="overview" activeId={activeTab}>
        <OverviewTab document={document} entities={entities} risks={risks} />
      </TabPanel>
      <TabPanel id="entities" activeId={activeTab}>
        <EntityTab entities={entities} highlightId={highlightId} />
      </TabPanel>
      <TabPanel id="clauses" activeId={activeTab}>
        <ClauseTab clauses={clauses} highlightId={highlightId} />
      </TabPanel>
      <TabPanel id="risks" activeId={activeTab}>
        <RiskPanel risks={risks} highlightId={highlightId} />
      </TabPanel>
      <TabPanel id="graph" activeId={activeTab}>
        {graphError ? (
          <ErrorState message={graphError} />
        ) : graph ? (
          <GraphView graph={graph} onSelectNode={handleSelectGraphNode} />
        ) : (
          <LoadingState label="Building knowledge graph..." />
        )}
      </TabPanel>
      <TabPanel id="ask" activeId={activeTab}>
        <AskPanel documentId={document.id} />
      </TabPanel>
    </div>
  );
}
