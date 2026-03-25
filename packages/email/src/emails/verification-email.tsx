import { Heading, Section, Text } from "@react-email/components";
import { emailBrand } from "./email-brand";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";
import { EmailLinkFallback } from "./email-link-fallback";
import { EmailNote } from "./email-note";

interface VerificationEmailProps {
	url: string;
}

export const VerificationEmail = ({ url }: VerificationEmailProps) => (
	<EmailLayout
		preview="Verify your email address"
		tagline="Welcome to Databuddy"
	>
		<Section className="text-center">
			<Heading
				className="m-0 mb-3 font-semibold text-xl tracking-tight"
				style={{ color: emailBrand.foreground }}
			>
				Verify Your Email
			</Heading>
			<Text
				className="m-0 mb-6 text-sm leading-relaxed"
				style={{ color: emailBrand.muted }}
			>
				Thanks for signing up! Click the button below to verify your email
				address and get started.
			</Text>
		</Section>
		<Section className="text-center">
			<EmailButton href={url}>Verify Email Address</EmailButton>
		</Section>
		<EmailNote>
			This link expires in 24 hours. If you didn't create an account, you can
			safely ignore this email.
		</EmailNote>
		<EmailLinkFallback href={url} />
	</EmailLayout>
);

export default VerificationEmail;
