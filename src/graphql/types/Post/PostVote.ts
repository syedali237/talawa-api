import { builder } from "~/src/graphql/builder";
import { PostVoteType } from "~/src/graphql/enums/PostVoteType";

export const PostVote = builder.objectRef<{
	id: string;
	creatorId: string;
	postId: string;
	type: "up_vote" | "down_vote";
}>("PostVote");

PostVote.implement({
	description: "Object representing a vote on a post.",
	fields: (t) => ({
		id: t.exposeID("id", { description: "Global identifier of the vote." }),
		creatorId: t.exposeID("creatorId", {
			description: "Global identifier of the vote creator.",
		}),
		postId: t.exposeID("postId", {
			description: "Global identifier of the post that is voted.",
		}),
		type: t.field({
			description: "Type of the vote.",
			type: PostVoteType,
			resolve: (parent) => parent.type,
		}),
	}),
});
