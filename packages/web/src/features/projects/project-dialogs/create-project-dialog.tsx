/** Create Project, opened from the sidebar's Project switcher. */
import { useEffect, useState } from "react";
import { Button, Input, Modal } from "@prismshadow/penguin-ui";
import * as api from "../../../api/endpoints";
import { S } from "../../../lib/strings";
import { apiErrorText } from "../../../lib/api-error";
import {
  PROJECT_ID_MAX_LENGTH,
  PROJECT_SUFFIX_PATTERN,
  SEMANTIC_ID_PATTERN,
} from "../../../lib/semantic-id";
import { useProject } from "../../../state/project";
import { useAuth } from "../../../state/auth";
import { SemanticIdField } from "../../semantic-id/semantic-id-field";

export function CreateProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const { user } = useAuth();
  const { currentProject } = useProject();
  // Non-admin Project ids are forced to have a "<username>-" prefix: the input locks the prefix segment, only the rest is editable.
  const prefix = user && !user.isAdmin ? `${user.userId}-` : "";
  const [idInput, setIdInput] = useState("");
  const [name, setName] = useState("");
  // The id is the only validated field; format problems and the server's rejection (e.g. duplicate id) both land beside it.
  const [idError, setIdError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  // No draft is kept: the form starts empty every time it opens.
  useEffect(() => {
    if (!open) return;
    setIdInput("");
    setName("");
    setIdError(undefined);
  }, [open]);

  const submit = async () => {
    const id = prefix + idInput.trim();
    if (!idInput.trim()) {
      setIdError(S.common.requiredField);
      return;
    }
    // Non-admin: validate the suffix segment (the hyphen is a reserved separator, appearing only once at the prefix join); admin: validate the whole string.
    const valid = prefix
      ? PROJECT_SUFFIX_PATTERN.test(idInput.trim()) && id.length <= PROJECT_ID_MAX_LENGTH
      : SEMANTIC_ID_PATTERN.test(id);
    if (!valid) {
      setIdError(prefix ? S.project.idPrefixHint : S.project.idHint);
      return;
    }
    setBusy(true);
    setIdError(undefined);
    try {
      const res = await api.createProject({
        projectId: id,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
      onCreated(res.project.projectId);
    } catch (e) {
      setIdError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={S.project.createTitle}
      onClose={onClose}
      footer={
        <>
          <Button size="sm" onClick={onClose}>
            {S.common.cancel}
          </Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void submit()}>
            {S.common.create}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* The name comes first and the id is derived from it: an id is the harder half to
            invent, and naming the thing is where anyone starts anyway. */}
        <Input
          label={S.project.displayName}
          hint={S.project.displayNameHint}
          size="sm"
          value={name}
          autoFocus
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
        {/* A Project is not inside a Project: the one this dialog was opened from lends its
            default model to the proposal. A non-admin types only what follows "<username>-". */}
        <SemanticIdField
          projectId={currentProject?.projectId ?? null}
          kind="project"
          label={S.project.id}
          hint={prefix ? S.project.idPrefixHint : S.project.idHint}
          value={idInput}
          source={name}
          error={idError}
          disabled={busy}
          {...(prefix ? { lockedPrefix: prefix } : {})}
          onChange={(id) => {
            setIdInput(id);
            setIdError(undefined);
          }}
        />
      </div>
    </Modal>
  );
}
