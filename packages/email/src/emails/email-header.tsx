import { Img, Section, Text } from "@react-email/components";
import { emailBrand } from "./email-brand";

interface EmailHeaderProps {
	tagline?: string;
}

export const EmailHeader = ({ tagline }: EmailHeaderProps) => (
	<Section className="pt-8 pb-6 text-center">
		<table align="center" cellPadding={0} cellSpacing={0}>
			<tr>
				<td align="center">
					<Img
						alt="Databuddy"
						height={emailBrand.primaryLogoHeightPx}
						src={emailBrand.primaryLogoUrl}
						width={emailBrand.primaryLogoWidthPx}
					/>
				</td>
			</tr>
		</table>
		{tagline ? (
			<Text
				className="mt-3 mb-0 text-muted text-xs"
				style={{ color: emailBrand.muted }}
			>
				{tagline}
			</Text>
		) : null}
	</Section>
);
