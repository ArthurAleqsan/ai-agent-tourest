import { Construction } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function Placeholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </section>
      <Card>
        <CardHeader>
          <Construction className="h-6 w-6 text-amber-500" />
          <CardTitle>Coming in a later step</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This screen is intentionally a shell. Scraping, messaging, and AI
            processing are not implemented yet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
