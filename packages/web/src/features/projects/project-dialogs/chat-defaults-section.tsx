import { useEffect, useState } from "react";
import type {
  ApprovalMode,
  ChatDefaultsDto,
  ModelRefDto,
  ModelsResponse,
} from "@prismshadow/penguin-server/api";
import {
  Button,
  FieldLabel,
  InfoPopover,
  Select,
  toastError,
  toastSuccess,
} from "@prismshadow/penguin-ui";
import * as api from "../../../api/endpoints";
import { S } from "../../../lib/strings";
import { apiErrorText } from "../../../lib/api-error";
import { agentDisplayName, useProject } from "../../../state/project";
import { useAuth } from "../../../state/auth";
import {
  clearDraftChatDefaults,
  clearDraftModelRef,
  dispatchChatDefaultsChanged,
  type ChatDefaultsChangedDetail,
} from "../../chat";
import { ModelCatalogSelect, SELECTABLE_THINKING_LEVELS, modelLabel } from "../../model-picker";
import { WorkspaceSelect } from "../../workspace";
import { sameModelRef } from "../../models/model-grouping";

/** Approval modes offered by the new-chat-defaults select, in the composer menu's order. */
const APPROVAL_MODES: readonly ApprovalMode[] = [
  "always-ask",
  "read-only",
  "allow-all",
  "deny-all",
];

/**
 * "New chat defaults" section of the Project settings dialog (below Members, above the
 * delete zone): the `[default_chat]` block (Agent / Workspace / approval mode / thinking
 * level) plus the Project's default model, laid out as a compact responsive two-column
 * grid. Workspace and model reuse the chat draft's own pickers — WorkspaceSelect (the
 * folder finder, a modal stacked on this one) and ModelCatalogSelect (the composer's model
 * picker, a dialog too) — with their `form` trigger variant, so the controls line up with
 * the dialog's Input/Select while what they open stays exactly the composer's.
 * The model default is SINGLE-SOURCED with the models page — the picker renders and writes
 * the same top-level `default_model` (via the narrow PUT /models/default route), never a
 * second key; changing it also releases the draft-cached model pin exactly as the models
 * page does (shared clearDraftModelRef helper). Owner edits with ONE explicit Save for the
 * whole section (dialog convention: failures toast, success is silent — the refreshed
 * values are the confirmation); members see the values read-only. Mounted per dialog open
 * (the Modal unmounts its children when closed), so reopening always refetches.
 */
export function ChatDefaultsSection({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner: boolean;
}) {
  const { user } = useAuth();
  const { agents } = useProject();
  /** Saved block (null while loading); edit buffers below use "" for "not set". */
  const [saved, setSaved] = useState<ChatDefaultsDto | null>(null);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [approval, setApproval] = useState("");
  const [thinking, setThinking] = useState("");
  /** The default-model pick (paired reference; seeded from the models response's defaultModel). */
  const [modelRef, setModelRef] = useState<ModelRefDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getChatDefaults(projectId)
      .then((res) => {
        if (cancelled) return;
        setSaved(res);
        setAgentId(res.agentId ?? "");
        setWorkspace(res.workspace ?? "");
        setApproval(res.approvalMode ?? "");
        setThinking(res.thinkingLevel ?? "");
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(apiErrorText(e));
      });
    api
      .getModels(projectId)
      .then((res) => {
        if (cancelled) return;
        setModels(res);
        setModelRef(res.defaultModel ?? null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(apiErrorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const blockDirty =
    saved !== null &&
    (agentId !== (saved.agentId ?? "") ||
      workspace.trim() !== (saved.workspace ?? "") ||
      approval !== (saved.approvalMode ?? "") ||
      thinking !== (saved.thinkingLevel ?? ""));
  const modelDirty =
    models !== null && modelRef !== null && !sameModelRef(models.defaultModel, modelRef);

  /**
   * One Save persists both writes: the `[default_chat]` block (whole-block PUT — a field
   * left "not set" is simply omitted, which clears it) and, when changed, the default
   * model via the narrow route. Failures toast and keep the edits for retry.
   *
   * Each landed write also resets the saving user's new-conversation draft so new chats
   * pick the change up instead of being shadowed by the values a previous /chat/new visit
   * pinned into the cache: the corresponding cache fields are stripped (typed text and
   * staged skills always survive), and one same-tab event carries the fresh values to any
   * MOUNTED draft view — its component state still holds the old selections and its
   * debounced persist would silently write them right back over the stripped cache.
   */
  const save = async () => {
    if (busy || (!blockDirty && !modelDirty)) return;
    setBusy(true);
    // Collected per landed write, dispatched in `finally`: when the block PUT lands but the
    // model PUT throws, the block change still happened server-side and live views must
    // still reseed from it.
    let changed: ChatDefaultsChangedDetail | null = null;
    try {
      if (blockDirty) {
        const body: ChatDefaultsDto = {
          ...(agentId ? { agentId } : {}),
          ...(workspace.trim() ? { workspace: workspace.trim() } : {}),
          ...(approval ? { approvalMode: approval as ApprovalMode } : {}),
          ...(thinking ? { thinkingLevel: thinking as ChatDefaultsDto["thinkingLevel"] } : {}),
        };
        const stored = await api.putChatDefaults(projectId, body);
        setSaved(stored);
        // Release the draft-cached Agent / Workspace / approval pins so the next
        // /chat/new seeds from the just-saved block. The model pin is deliberately NOT
        // touched here: it is the switch-becomes-default carry-over, released only below
        // when the default model itself changed.
        if (user) clearDraftChatDefaults(user.userId, projectId);
        changed = { projectId, defaults: stored };
      }
      if (modelDirty && modelRef) {
        const res = await api.putDefaultModel(projectId, {
          provider: modelRef.provider,
          modelId: modelRef.modelId,
        });
        setModels((m) => (m ? { ...m, defaultModel: res.defaultModel } : m));
        // Same follow-through as the models page: drop the draft-cached model pin so open
        // drafts pick up the new default.
        if (user) clearDraftModelRef(user.userId, projectId);
        changed = { ...(changed ?? { projectId }), defaultModel: res.defaultModel };
      }
      // Both writes landed (the try didn't throw): confirm it — the dialog stays open, so
      // without a toast a successful save is silent. `changed` is non-null whenever
      // anything was actually written (the early-return above guards the no-op case).
      if (changed) toastSuccess(S.common.saved);
    } catch (e) {
      toastError(apiErrorText(e));
    } finally {
      if (changed) dispatchChatDefaultsChanged(changed);
      setBusy(false);
    }
  };

  /** Read-only display values (member view). */
  const agentText = saved?.agentId
    ? (() => {
        const a = agents.find((x) => x.agentId === saved.agentId);
        return a ? agentDisplayName(a) : saved.agentId;
      })()
    : S.project.chatDefaultsNotSet;
  const defaultModelInfo = models?.models.find((m) => sameModelRef(m, models.defaultModel));

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
        {S.project.chatDefaultsTitle}
        <InfoPopover label={S.project.chatDefaultsTitle}>{S.project.chatDefaultsHint}</InfoPopover>
      </p>
      {loadError ? (
        <p className="text-xs text-red-600 dark:text-red-400">{loadError}</p>
      ) : saved === null || models === null ? (
        <p className="text-xs text-gray-400">{S.common.loading}</p>
      ) : isOwner ? (
        <>
          {/* Compact responsive grid: label + control stacked per cell, two columns from sm
              up; the workspace picker spans the full row for path width. Workspace and model
              are the chat draft's own pickers, not plain form controls. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label={S.project.chatDefaultsAgent}
              size="sm"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">{S.project.chatDefaultsNotSet}</option>
              {agents.map((a) => (
                <option key={a.agentId} value={a.agentId}>
                  {agentDisplayName(a)}
                </option>
              ))}
            </Select>
            <Select
              label={S.chat.approvalMode}
              size="sm"
              value={approval}
              onChange={(e) => setApproval(e.target.value)}
            >
              <option value="">{S.project.chatDefaultsApprovalNotSet}</option>
              {APPROVAL_MODES.map((m) => (
                <option key={m} value={m}>
                  {S.chat.approvalModeNames[m] ?? m}
                </option>
              ))}
            </Select>
            {/* Plain tier names, not the composer dropdown's annotated variant: a Select
                shows the picked option's own text on its closed trigger, so
                annotating the rows here would also put "(xhigh)" on what is, once closed,
                a trigger. Matches the approval-mode select directly above, whose options
                are plain localized names too. */}
            <Select
              label={S.chat.thinkingLevel}
              size="sm"
              value={thinking}
              onChange={(e) => setThinking(e.target.value)}
            >
              <option value="">{S.project.chatDefaultsThinkingNotSet}</option>
              {SELECTABLE_THINKING_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {S.chat.thinkingLevelNames[l] ?? l}
                </option>
              ))}
            </Select>
            <div>
              <span className="mb-1 flex items-center gap-1">
                <FieldLabel block={false}>{S.chat.model}</FieldLabel>
                <InfoPopover label={S.chat.model}>{S.project.chatDefaultsModelHint}</InfoPopover>
              </span>
              {models.models.length > 0 ? (
                <>
                  {/* The composer's model picker (provider logo + name, opening the model-picker
                      dialog); the default row carries the S.models.default marker. */}
                  <ModelCatalogSelect
                    models={models.models}
                    value={modelRef}
                    defaultModel={models.defaultModel}
                    onChange={setModelRef}
                    disabled={busy}
                    variant="form"
                  />
                </>
              ) : (
                <p className="text-xs text-gray-400">{S.models.empty}</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>{S.chat.workspace}</FieldLabel>
              {/* The draft page's folder finder: browse server directories, go to a typed
                  path, or start in a temporary workspace. That one would belong to the
                  default Agent when one is set, so the finder can show where. */}
              <WorkspaceSelect
                projectId={projectId}
                workspace={workspace}
                onChange={setWorkspace}
                {...(agentId ? { agentId } : {})}
                variant="form"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              disabled={busy || (!blockDirty && !modelDirty)}
              onClick={() => void save()}
            >
              {S.common.save}
            </Button>
          </div>
        </>
      ) : (
        // Member view: the effective defaults, read-only (same fields, plain text).
        <div className="space-y-1 text-sm">
          {(
            [
              [S.project.chatDefaultsAgent, agentText],
              [S.chat.workspace, saved.workspace ?? S.chat.workspaceAuto],
              [
                S.chat.approvalMode,
                saved.approvalMode
                  ? (S.chat.approvalModeNames[saved.approvalMode] ?? saved.approvalMode)
                  : S.project.chatDefaultsApprovalNotSet,
              ],
              [
                S.chat.thinkingLevel,
                saved.thinkingLevel
                  ? (S.chat.thinkingLevelNames[saved.thinkingLevel] ?? saved.thinkingLevel)
                  : S.project.chatDefaultsThinkingNotSet,
              ],
              [
                S.chat.model,
                defaultModelInfo ? modelLabel(defaultModelInfo) : S.project.chatDefaultsNotSet,
              ],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-2">
              <span className="w-24 shrink-0 text-xs text-gray-500">{label}</span>
              <span className="min-w-0 flex-1 break-all">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
