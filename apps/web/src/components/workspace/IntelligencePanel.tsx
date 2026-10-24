"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Dialog } from "@/components/ui/Dialog";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { NODE_TAB } from "@/lib/graphLabels";
import { rawId, type EvidenceTarget } from "@/lib/graphModel";
import { OverviewTab } from "./OverviewTab";
import { EntityTab } from "./EntityTab";
import { ClauseTab } from "./ClauseTab";
import { RiskPanel } from "./RiskPanel";
import { GraphView } from "./GraphView";
import { AskPanel } from "./AskPanel";
import { ObligationsTab } from "./ObligationsTab";
import { ConsistencyTab } from "./ConsistencyTab";
import { useEvidenceFocus } from "./EvidenceFocusContext";

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

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export function IntelligencePanel({
  document,
  entities,
  clauses,
  risks,
  onWideChange,
}: {
  document: DocumentDetail;
  entities: Entity[];
  clauses: DocumentClause[];
  risks: Risk[];
  /** Told when the panel wants the room the document column would give it (the graph). */
  onWideChange?: (wide: boolean) => void;
}) {
  const { focusEvidence } = useEvidenceFocus();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [graph, setGraph] = useState<DocumentGraph | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [graphExpanded, setGraphExpanded] = useState(false);
  // Phase 8 semantic layer. A failure here never blocks the Phase 7B tabs:
  // each one has its own error state with a retry.
  const [overview, setOverview] = useState<DocumentOverview | null>(null);
  const [overviewFailed, setOverviewFailed] = useState(false);
  const [obligations, setObligations] = useState<Obligation[] | null>(null);
  const [obligationsError, setObligationsError] = useState<string | null>(null);

  const loadOverview = useCallback(() => {
    setOverviewFailed(false);
    getOverview(document.id)
      .then(setOverview)
      .catch(() => setOverviewFailed(true));
  }, [document.id]);
  useEffect(loadOverview, [loadOverview]);

  // Loaded up front: the overview and the rail show the obligation count.
  const loadObligations = useCallback(() => {
    setObligationsError(null);
    getObligations(document.id)
      .then(setObligations)
      .catch((err: unknown) => setObligationsError(message(err, "Could not load obligations")));
  }, [document.id]);
  useEffect(loadObligations, [loadObligations]);

  const loadGraph = useCallback(() => {
    setGraphError(null);
    getGraph(document.id)
      .then(setGraph)
      .catch((err: unknown) => setGraphError(message(err, "Could not load the graph")));
  }, [document.id]);
  useEffect(() => {
    if (activeTab === "graph" && !graph && !graphError) loadGraph();
  }, [activeTab, graph, graphError, loadGraph]);

  useEffect(() => {
    onWideChange?.(activeTab === "graph");
  }, [activeTab, onWideChange]);

  // The clause whose text contains an offset - how an obligation's sentence
  // is traced to its clause.
  const clauseAt = useCallback(
    (offset: number) =>
      clauses.find(
        (c) =>
          c.modelSource === "RULE_BASED" &&
          c.textStart !== null &&
          c.textEnd !== null &&
          c.textStart <= offset &&
          offset < c.textEnd,
      )?.id ?? null,
    [clauses],
  );

  // From a graph node to the same item in its workspace tab, highlighted.
  const openInTab = useCallback((node: GraphNode) => {
    const target = NODE_TAB[node.type];
    if (!target) return;
    setHighlightId(rawId(node.id));
    setActiveTab(target.tab as TabId);
    setGraphExpanded(false);
  }, []);
  const showInDocument = useCallback(
    (t: EvidenceTarget) => {
      focusEvidence(t.clauseIds, t.entityIds);
      setGraphExpanded(false);
    },
    [focusEvidence],
  );

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
  const graphView = (expanded: boolean) =>
    graph ? (
      <GraphView
        graph={graph}
        clauseAt={clauseAt}
        onShowInDocument={showInDocument}
        onOpenInTab={openInTab}
        showMiniMap={expanded}
        {...(expanded ? {} : { onExpand: () => setGraphExpanded(true) })}
      />
    ) : null;

  return (
    <div className="flex h-full flex-col md:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-ink-200 bg-paper-50 px-4 py-3">
          <h2 className="text-section-title text-ink-800">{meta.title}</h2>
          <p className="mt-0.5 text-xs text-ink-500">{meta.hint}</p>
        </div>
        <TabPanel id="overview" activeId={activeTab}>
          {overviewFailed && (
            <div
              role="alert"
              className="m-4 mb-0 flex items-center justify-between gap-3 rounded border border-review-border bg-review-bg px-3 py-2 text-xs text-review-text"
            >
              <span>The domain-specific key terms could not be loaded.</span>
              <button
                type="button"
                onClick={loadOverview}
                className="shrink-0 font-medium underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}
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
            <ErrorState message={obligationsError} onRetry={loadObligations} />
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
            <ErrorState message={graphError} onRetry={loadGraph} />
          ) : graph ? (
            graphView(false)
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
      <Dialog
        open={graphExpanded && graph !== null}
        onClose={() => setGraphExpanded(false)}
        labelledBy="graph-dialog-title"
        backdropClassName="p-3 sm:p-8"
        className="flex h-full max-h-full w-full flex-col overflow-hidden rounded-lg border border-ink-200 bg-paper-50 shadow-panel"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-ink-200 px-4 py-2">
          <h2 id="graph-dialog-title" className="text-section-title text-ink-700">
            Knowledge graph
          </h2>
          <button
            type="button"
            data-autofocus
            onClick={() => setGraphExpanded(false)}
            className="rounded px-2 py-1 text-xs font-medium text-ink-600 hover:bg-paper-200"
          >
            Close (Esc)
          </button>
        </div>
        <div className="min-h-0 flex-1">{graphExpanded ? graphView(true) : null}</div>
      </Dialog>
    </div>
  );
}
