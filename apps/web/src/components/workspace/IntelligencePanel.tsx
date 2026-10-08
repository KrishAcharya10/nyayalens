"use client";

import { useEffect, useState } from "react";
import type {
  DocumentClause,
  DocumentDetail,
  DocumentGraph,
  DocumentOverview,
  Entity,
  GraphNode,
  Obligation,
  Risk,
} from "@/lib/apiTypes";
import { getGraph, getObligations, getOverview } from "@/lib/api";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { OverviewTab } from "./OverviewTab";
import { EntityTab } from "./EntityTab";
import { ClauseTab } from "./ClauseTab";
import { RiskPanel } from "./RiskPanel";
import { GraphView } from "./GraphView";
import { AskPanel } from "./AskPanel";
import { ObligationsTab } from "./ObligationsTab";
import { ConsistencyTab } from "./ConsistencyTab";

type TabId =
  "overview" | "entities" | "clauses" | "obligations" | "risks" | "consistency" | "graph" | "ask";

// Domain-aware example questions for the Ask tab, built from the
// DomainPack's overview fields ("Who is the buyer?", "What is the sale
// consideration?") - only for fields this document actually has.
export function exampleQuestionsFor(overview: DocumentOverview | null): string[] | undefined {
  if (!overview) return undefined;
  const qs = overview.fields
    .filter((f) => f.value !== null)
    .slice(0, 4)
    .map((f) =>
      f.coreType === "PARTY"
        ? `Who is the ${f.displayName.toLowerCase()}?`
        : f.coreType === "DATE"
          ? `When is the ${f.displayName.toLowerCase()}?`
          : `What is the ${f.displayName.toLowerCase()}?`,
    );
  return qs.length > 0 ? qs : undefined;
}

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
  // Phase 8 semantic layer. A failure here never blocks the Phase 7B tabs:
  // the overview falls back to its original view and obligations show an
  // error state of their own.
  const [overview, setOverview] = useState<DocumentOverview | null>(null);
  const [obligations, setObligations] = useState<Obligation[] | null>(null);
  const [obligationsError, setObligationsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOverview(document.id)
      .then((o) => {
        if (!cancelled) setOverview(o);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [document.id]);

  useEffect(() => {
    if (activeTab !== "obligations" || obligations) return;
    getObligations(document.id)
      .then(setObligations)
      .catch((err: unknown) =>
        setObligationsError(err instanceof Error ? err.message : "Could not load obligations"),
      );
  }, [activeTab, obligations, document.id]);

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
    else if (type === "obligation" || type === "event") setActiveTab("obligations");
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
          { id: "obligations", label: "Obligations" },
          {
            id: "risks",
            label: "Risks",
            count: risks.filter((r) => r.modelSource === "RULE_BASED").length,
          },
          {
            id: "consistency",
            label: "Consistency",
            count: risks.filter((r) => r.modelSource === "RULE_BASED" && r.pass === "CONSISTENCY")
              .length,
          },
          { id: "graph", label: "Graph" },
          { id: "ask", label: "Ask" },
        ]}
      />
      <TabPanel id="overview" activeId={activeTab}>
        <OverviewTab document={document} entities={entities} risks={risks} overview={overview} />
      </TabPanel>
      <TabPanel id="entities" activeId={activeTab}>
        <EntityTab entities={entities} highlightId={highlightId} />
      </TabPanel>
      <TabPanel id="clauses" activeId={activeTab}>
        <ClauseTab clauses={clauses} highlightId={highlightId} />
      </TabPanel>
      <TabPanel id="obligations" activeId={activeTab}>
        {obligationsError ? (
          <ErrorState message={obligationsError} />
        ) : obligations ? (
          <ObligationsTab obligations={obligations} />
        ) : (
          <LoadingState label="Loading obligations..." />
        )}
      </TabPanel>
      <TabPanel id="risks" activeId={activeTab}>
        <RiskPanel risks={risks} highlightId={highlightId} />
      </TabPanel>
      <TabPanel id="consistency" activeId={activeTab}>
        <ConsistencyTab risks={risks} highlightId={highlightId} />
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
        <AskPanel
          documentId={document.id}
          {...(exampleQuestionsFor(overview)
            ? { exampleQuestions: exampleQuestionsFor(overview)! }
            : {})}
        />
      </TabPanel>
    </div>
  );
}
