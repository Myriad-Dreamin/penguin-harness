import { useState } from "react";
import {
  Button,
  ConfirmModal,
  FieldError,
  Input,
  SettingRow,
  toastError,
} from "@prismshadow/penguin-ui";
import * as api from "../../../api/endpoints";
import { S } from "../../../lib/strings";
import { apiErrorText } from "../../../lib/api-error";
import { projectDisplayName, useProject } from "../../../state/project";

/**
 * General page: the display name (the Project's only editable field — the id names the
 * directory and every stored reference, so it stays immutable and gets a read-only row),
 * plus the delete zone. Saving the name is explicit; success needs no toast (the switcher,
 * this field and every Project list re-render once reloadProjects settles, #54), only
 * failures pop one, and the field keeps what was typed so it can be retried.
 */
export function GeneralSection({
  projectId,
  isOwner,
  onClose,
}: {
  projectId: string;
  isOwner: boolean;
  onClose: () => void;
}) {
  const { currentProject, setCurrentProjectId, projects, reloadProjects } = useProject();
  /** The saved display name, with the same id fallback the switcher shows. */
  const savedName = currentProject ? projectDisplayName(currentProject) : "";
  /** Display-name edit buffer (owner only); saving is explicit, so it stays dirty until Save or remount. */
  const [name, setName] = useState(savedName);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveName = async () => {
    const next = name.trim();
    if (!next || next === savedName || nameBusy) return;
    setNameBusy(true);
    setNameError(undefined);
    try {
      await api.updateProject(projectId, { name: next });
      await reloadProjects();
    } catch (e) {
      setNameError(apiErrorText(e));
    } finally {
      setNameBusy(false);
    }
  };

  const doDelete = async () => {
    try {
      await api.deleteProject(projectId);
      onClose();
      const next = projects.find((p) => p.projectId !== projectId);
      await reloadProjects();
      if (next) setCurrentProjectId(next.projectId);
    } catch (e) {
      toastError(apiErrorText(e));
    }
  };

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
      <SettingRow title={S.project.displayName}>
        {isOwner ? (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-stretch gap-2">
              <Input
                size="sm"
                className="w-44"
                value={name}
                invalid={Boolean(nameError)}
                maxLength={100}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(undefined);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveName();
                }}
              />
              <Button
                size="sm"
                disabled={nameBusy || !name.trim() || name.trim() === savedName}
                onClick={() => void saveName()}
              >
                {S.common.save}
              </Button>
            </div>
            {nameError !== undefined && <FieldError>{nameError}</FieldError>}
          </div>
        ) : (
          <span className="text-sm">{savedName}</span>
        )}
      </SettingRow>
      <SettingRow title={S.project.projectIdLabel}>
        <span className="font-mono text-xs text-gray-400">{projectId}</span>
      </SettingRow>
      {isOwner &&
        (projectId === "default_project" ? (
          <SettingRow
            title={S.project.deleteProject}
            description={S.project.deleteDefaultForbidden}
          />
        ) : projects.length <= 1 ? (
          // Last accessible Project: deleting it would leave the account with no Project to
          // select (the page would get stuck on the skeleton screen), so the entry point is
          // hidden outright, matching the server's 409 rejection.
          <SettingRow title={S.project.deleteProject} description={S.project.deleteLastForbidden} />
        ) : (
          <SettingRow title={S.project.deleteProject} description={S.project.deleteProjectDesc}>
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
              {S.common.delete}
            </Button>
          </SettingRow>
        ))}

      {/* Delete confirmation (shared ConfirmModal, stacked above the settings dialog). */}
      <ConfirmModal
        open={confirmDelete}
        title={S.project.deleteProject}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void doDelete()}
        confirmLabel={S.common.confirm}
        cancelLabel={S.common.cancel}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">{S.project.deleteConfirm}</p>
      </ConfirmModal>
    </div>
  );
}
