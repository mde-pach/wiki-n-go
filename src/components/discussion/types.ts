import type { Comment } from "../../lib/comments";

export type ComposerState =
  | { mode: "topic" }
  | { mode: "reply"; parentId: string; topicId: string }
  | null;

export interface TreeProps {
  topicId: string;
  comments: Comment[];
  composer: ComposerState;
  setComposer: (s: ComposerState) => void;
  onSubmit: (
    text: string,
    token: string | undefined,
    parentId: string,
    topicId: string,
  ) => Promise<void>;
}
