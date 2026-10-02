import { describe, expect, it } from 'vitest';

import { buildPublishedReviewShellHtml } from '../publishedReviewShell.ts';

describe('published review shell renderer', () => {
  it('embeds the manifest-bound runtime with the existing inline annotation toolbar', () => {
    const html = buildPublishedReviewShellHtml({
      shareId: 'share-a',
      projectId: 'project-a',
      runtimePath: '/prototypes/home',
      previewPath: '/prototypes/home?agentToolbar=host#page=overview',
      commentable: true,
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('src="/prototypes/home?');
    expect(html).toContain('projectId=project-a');
    expect(html).not.toContain('agentToolbar=host');
    expect(html).toContain('annotationSession=1');
    expect(html).toContain('publishedShareId=share-a');
    expect(html).toContain('#page=overview"');
    expect(html).not.toContain('published-review-toolbar');
    expect(html).not.toContain('AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION');
    expect(html).not.toContain('>刷新<');
    expect(html).not.toContain('>深色<');
  });

  it('escapes user-controlled values before embedding them in the shell script', () => {
    const html = buildPublishedReviewShellHtml({
      shareId: 'share-a',
      projectId: '</script><script>alert(1)</script>',
      runtimePath: '/prototypes/home',
      previewPath: '/prototypes/home#page=overview',
      commentable: true,
    });

    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('projectId=%3C%2Fscript%3E%3Cscript%3Ealert%281%29%3C%2Fscript%3E');
  });

  it('drops preview query values that could escape the published resource context', () => {
    const html = buildPublishedReviewShellHtml({
      shareId: 'share-a',
      projectId: 'project-a',
      runtimePath: '/prototypes/home',
      previewPath: '/prototypes/home?projectId=other&publishedShareId=other-share&annotationSession=0&agentToolbar=host#page=overview',
      commentable: true,
    });

    expect(html).toContain('src="/prototypes/home?');
    expect(html).toContain('projectId=project-a');
    expect(html).not.toContain('agentToolbar=host');
    expect(html).toContain('annotationSession=1');
    expect(html).toContain('publishedShareId=share-a');
    expect(html).toContain('#page=overview"');
    expect(html).not.toContain('other-share');
  });

  it('loads the original client runtime directly while keeping Make as the annotation API origin', () => {
    const html = buildPublishedReviewShellHtml({
      shareId: 'share-a',
      projectId: 'project-a',
      runtimePath: '/prototypes/home',
      runtimeOrigin: 'http://localhost:51720',
      makeServerOrigin: 'http://localhost:53817',
      previewPath: '/prototypes/home?agentToolbar=host#page=overview',
      commentable: true,
    });

    expect(html).toContain(
      'src="http://localhost:51720/prototypes/home?projectId=project-a&amp;makeServerOrigin=http%3A%2F%2Flocalhost%3A53817&amp;annotationSession=1&amp;publishedShareId=share-a#page=overview"',
    );
  });

  it('does not auto-start the annotation runtime when the manifest disables comments', () => {
    const html = buildPublishedReviewShellHtml({
      shareId: 'share-readonly',
      projectId: 'project-a',
      runtimePath: '/prototypes/home',
      previewPath: '/prototypes/home?agentToolbar=host#page=overview',
      commentable: false,
    });

    expect(html).toContain('src="/prototypes/home?projectId=project-a&amp;publishedShareId=share-readonly#page=overview"');
    expect(html).not.toContain('annotationSession=1');
    expect(html).not.toContain('published-review-header');
  });
});
