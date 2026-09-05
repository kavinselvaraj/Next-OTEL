import * as prismic from "@prismicio/client";

export function createClient(repositoryName: string) {
  return prismic.createClient(repositoryName);
}
