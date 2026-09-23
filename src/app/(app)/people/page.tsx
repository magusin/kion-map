import { requirePageUser } from "@/lib/auth";
import PeopleView from "@/components/people-view";

export default async function PeoplePage(props: PageProps<"/people">) {
  await requirePageUser();
  const { name, q } = await props.searchParams;
  return <PeopleView key={typeof name === "string" ? name : ""} initialName={typeof name === "string" ? name : null} initialQ={typeof q === "string" ? q : ""} />;
}
