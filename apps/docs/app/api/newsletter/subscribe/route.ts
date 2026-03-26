import { type NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID ?? "";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: NextRequest) {
	try {
		let body: Record<string, unknown>;
		try {
			body = (await request.json()) as Record<string, unknown>;
		} catch {
			return NextResponse.json(
				{ error: "Invalid request body" },
				{ status: 400 }
			);
		}

		const email =
			typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

		if (!(email && EMAIL_REGEX.test(email))) {
			return NextResponse.json(
				{ error: "Please enter a valid email address" },
				{ status: 400 }
			);
		}

		if (!AUDIENCE_ID) {
			return NextResponse.json(
				{ error: "Newsletter is not configured" },
				{ status: 500 }
			);
		}

		await resend.contacts.create({
			email,
			audienceId: AUDIENCE_ID,
		});

		return NextResponse.json({ success: true });
	} catch (error: unknown) {
		const message =
			error instanceof Error ? error.message : "Something went wrong";

		if (message.includes("already exists")) {
			return NextResponse.json({ success: true });
		}

		return NextResponse.json({ error: message }, { status: 500 });
	}
}
