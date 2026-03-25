import { Heading, Section, Text } from "@react-email/components";
import { emailBrand } from "./email-brand";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";
import { EmailLinkFallback } from "./email-link-fallback";
import { EmailNote } from "./email-note";

interface MagicLinkEmailProps {
	url: string;
}

export const MagicLinkEmail = ({ url }: MagicLinkEmailProps) => (
	<EmailLayout
		preview="Your magic link to sign in"
		tagline="Sign in to Databuddy"
	>
		<Section className="text-center">
			<Heading
				className="m-0 mb-3 font-semibold text-xl tracking-tight"
				style={{ color: emailBrand.foreground }}
			>
				Your Magic Link
			</Heading>
			<Text
				className="m-0 mb-6 text-sm leading-relaxed"
				style={{ color: emailBrand.muted }}
			>
				Click the button below to securely sign in to your account. No password
				needed.
			</Text>
		</Section>
		<Section className="text-center">
			<EmailButton href={url}>Sign In to Databuddy</EmailButton>
		</Section>
		<EmailNote>
			This link expires in 24 hours and can only be used once. If you didn't
			request this, you can safely ignore this email.
		</EmailNote>
		<EmailLinkFallback href={url} />
	</EmailLayout>
);

export default MagicLinkEmail;
