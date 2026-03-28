import type { AppRouter } from "@databuddy/rpc";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

const link = new RPCLink({
	url: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/rpc`,
});

export const publicRPCClient = createORPCClient(
	link
) as RouterClient<AppRouter>;
