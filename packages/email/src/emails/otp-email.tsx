import { Heading, Section, Text } from "@react-email/components";
import { emailBrand } from "./email-brand";
import { EmailLayout } from "./email-layout";
import { EmailNote } from "./email-note";

interface OtpEmailProps {
	otp: string;
}

export const OtpEmail = ({ otp }: OtpEmailProps) => (
	<EmailLayout preview="Your verification code" tagline="Verification Code">
		<Section className="text-center">
			<Heading
				className="m-0 mb-3 font-semibold text-xl tracking-tight"
				style={{ color: emailBrand.foreground }}
			>
				Your One-Time Code
			</Heading>
			<Text
				className="m-0 mb-6 text-sm leading-relaxed"
				style={{ color: emailBrand.muted }}
			>
				Enter this code to complete your sign-in. Do not share this code with
				anyone.
			</Text>
		</Section>
		<Section className="text-center">
			<Text
				className="m-0 inline-block rounded px-8 py-4 font-bold font-mono text-2xl"
				style={{
					backgroundColor: emailBrand.inset,
					border: `1px solid ${emailBrand.border}`,
					color: emailBrand.foreground,
					letterSpacing: "0.3em",
				}}
			>
				{otp}
			</Text>
		</Section>
		<EmailNote>
			This code expires in 10 minutes. If you didn't request this code, someone
			may be trying to access your account. Please secure your account
			immediately.
		</EmailNote>
	</EmailLayout>
);

export default OtpEmail;
