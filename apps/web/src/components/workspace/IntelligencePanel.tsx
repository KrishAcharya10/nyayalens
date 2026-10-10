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
import { RailTabs, TabPanel } from "@/components/ui/Tabs";
import { Icon, type IconName } from "@/components/ui/Icon";
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

const TAB_META: Record<TabId, { label: string; title: string; hint: string; icon: IconName }> = {
  overview: {
    label: "Overview",
    title: "Overview",
    hint: "What this agreement says, and what needs review",
    icon: "summary",
  },
  entities: {
    label: "Entities",
    title: "Extracted entities",
    hint: "Every party, amount, date and detail found, grouped by type",
    icon: "tag",
  },
  clauses: {
    label: "Clauses",
    title: "Clauses",
    hint: "Each clause and what kind of provision it is",
    icon: "clauses",
  },
  obligations: {
    label: "Obligations",
    title: "Obligations",
    hint: "Who must do what, by when",
    icon: "checklist",
  },
  risks: {
    label: "Risks",
    title: "Potential issues",
    hint: "Provisions that may warrant review before signing",
    icon: "alert",
  },
  consistency: {
    label: "Consistency",
    title: "Consistency",
    hint: "Values the document states differently in different places",
    icon: "scale",
  },
  graph: {
    label: "Graph",
    title: "Knowledge graph",
    hint: "How parties, terms, obligations and findings connect",
    icon: "graph",
  },
  ask: {
    label: "Ask",
    title: "Ask this document",
    hint: "Answers come only from this document",
    icon: "chat",
  },
};

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
  const [graphExpanded, setGraphExpanded] = useState(false);
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

  // Loaded up front: the overview and the rail show the obligation count.
  useEffect(() => {
    let cancelled = false;
    getObligations(document.id)
      .then((o) => {
        if (!cancelled) setObligations(o);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setObligationsError(err instanceof Error ? err.message : "Could not load obligations");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [document.id]);

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

  const ruleRisks = risks.filter((r) => r.modelSource === "RULE_BASED");
  const consistencyCount = ruleRisks.filter((r) => r.pass === "CONSISTENCY").length;
  const counts: Partial<Record<TabId, number>> = {
    entities: entities.filter((e) => e.modelSource === "RULE_BASED").length,
    clauses: clauses.filter((c) => c.modelSource === "RULE_BASED").length,
    obligations: obligations?.length ?? 0,
    risks: ruleRisks.length,
    consistency: consistencyCount,
  };
  const meta = TAB_META[activeTab];

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-ink-200 bg-paper-50 px-4 py-3">
          <h2 className="text-section-title text-ink-800">{meta.title}</h2>
          <p className="mt-0.5 text-xs text-ink-400">{meta.hint}</p>
        </div>
        <TabPanel id="overview" activeId={activeTab}>
          <OverviewTab
            document={document}
            entities={entities}
            risks={risks}
            overview={overview}
            obligationCount={obligations?.length ?? null}
            onNavigate={(tab) => setActiveTab(tab as TabId)}
          />
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
            <GraphView
              graph={graph}
              onSelectNode={handleSelectGraphNode}
              // The side panel is narrow: start with the document's terms,
              // obligations and findings; clauses and references are a click away.
              initialHidden={["CLAUSE", "LEGAL_REFERENCE"]}
              showMiniMap={false}
              onExpand={() => setGraphExpanded(true)}
            />
          ) : (
            <LoadingState label="Building knowledge graph..." />
          )}
        </TabPanel>
        {graphExpanded && graph && (
          <GraphOverlay onClose={() => setGraphExpanded(false)}>
            <GraphView
              graph={graph}
              onSelectNode={(node) => {
                setGraphExpanded(false);
                handleSelectGraphNode(node);
              }}
            />
          </GraphOverlay>
        )}
        <TabPanel id="ask" activeId={activeTab}>
          <AskPanel
            documentId={document.id}
            {...(exampleQuestionsFor(overview)
              ? { exampleQuestions: exampleQuestionsFor(overview)! }
              : {})}
          />
        </TabPanel>
      </div>
      <RailTabs
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        tabs={(Object.keys(TAB_META) as TabId[]).map((id) => ({
          id,
          label: TAB_META[id].label,
          icon: <Icon name={TAB_META[id].icon} size={18} />,
          ...(counts[id] !== undefined ? { count: counts[id] } : {}),
          alert: id === "consistency" && consistencyCount > 0,
        }))}
      />
    </div>
  );
}

// Full-screen view of the knowledge graph. Escape or the close button
// returns to the workspace; clicking a node closes it and opens that
// node's card in the panel.
function GraphOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Knowledge graph"
      className="fixed inset-0 z-50 flex flex-col bg-ink-900/40 p-4 backdrop-blur-[1px] sm:p-8"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-ink-200 bg-paper-50 shadow-panel">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-2">
          <p className="text-section-title text-ink-700">Knowledge graph</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs font-medium text-ink-500 hover:bg-paper-200"
          >
            Close (Esc)
          </button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
