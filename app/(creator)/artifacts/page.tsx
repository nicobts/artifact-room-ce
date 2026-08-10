import Link from "next/link";
import { ArtifactUploader } from "@/components/artifact-uploader";
import { DeleteArtifactButton } from "@/components/delete-artifact-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCreatorSession } from "@/lib/session";
import { listArtifacts } from "@/lib/artifacts";

export default async function ArtifactsPage() {
  const session = await getCreatorSession();
  if (!session) return null; // (creator) layout guards
  const artifacts = listArtifacts(session.user.id);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <ArtifactUploader />

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Your artifacts</h2>
        {artifacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No artifacts yet. Upload your first one above.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {artifacts.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle className="truncate text-base">
                    {a.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <Badge variant="secondary">
                    {a.slideCount != null ? `${a.slideCount} slides` : "HTML"}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/artifacts/${a.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      Manage shares
                    </Link>
                    <DeleteArtifactButton id={a.id} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
