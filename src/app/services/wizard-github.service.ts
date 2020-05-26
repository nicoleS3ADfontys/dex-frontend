/*
 *  Digital Excellence Copyright (C) 2020 Brend Smits
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published
 *   by the Free Software Foundation version 3 of the License.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty
 *   of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *   See the GNU Lesser General Public License for more details.
 *
 *   You can find a copy of the GNU Lesser General Public License
 *   along with this program, in the LICENSE.md file in the root project directory.
 *   If not, see https://www.gnu.org/licenses/lgpl-3.0.txt
 */
import { HttpClient } from '@angular/common/http';
import { GenericWizard } from './interfaces/generic-wizard';
import { Injectable } from '@angular/core';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { GitHubContributor } from '../models/resources/external/github/contributor';
import { MappedCollaborator } from '../models/internal/mapped-collaborator';
import { Collaborator } from '../models/domain/collaborator';
import { GitHubRepo } from '../models/resources/external/github/repo';
import { MappedProject } from 'src/app/models/internal/mapped-project';
import { StringUtils } from '../utils/string.utils';

/**
 * Service to fetch a repo and it's details from Github.
 */
@Injectable({
  providedIn: 'root'
})
export class WizardGithubService implements GenericWizard {

  private readonly githubApiUrl = 'https://api.github.com';
  private readonly githubReposEndpoint = 'repos';
  private readonly githubCollaboratorsEndpoint = 'contributors';

  private readonly githubRawContentUrl = 'https://raw.githubusercontent.com';
  private readonly githubReadme = 'README.md';

  private readonly githubUrlFragments = [
    'https://',
    'http://',
    'www.',
    'github.com/'
  ];

  constructor(
    private httpClient: HttpClient
  ) { }

  fetchProjectDetails(url: string): Observable<MappedProject> {
    // Fetch the repo name & owner from the url.
    const urlOwnerRepo = this.parseNameAndOwnerFromUrl(url);

    if (urlOwnerRepo == null) {
      return throwError('Url invalid, could not be parsed.');
    }
    const repoName = urlOwnerRepo.repoName;
    const ownerName = urlOwnerRepo.ownerName;

    // Execute all http requests in paralel.
    return forkJoin([
      this.fetchRepo(repoName, ownerName)
        .pipe(
          // Use the result of the fetchRepo to fetch the readme based on the repo it's default branch.
          switchMap(repo => {
            return this.fetchReadme(repoName, ownerName, repo.default_branch)
              .pipe(
                map(readme => {
                  return { repo, readme };
                })
              );
          })
        ),
      this.fetchCollaborators(repoName, ownerName),
    ])
      .pipe(
        // Map the results to a MappedProject.
        map(([{ repo, readme }, collaborators]) => {

          const mappedCollaborators: MappedCollaborator[] = [];
          if (collaborators != null) {
            collaborators.forEach(colloborator => {
              const mappedCollaborator: Collaborator = {
                id: null,
                fullName: colloborator.login,
                role: 'Developer'
              };
              mappedCollaborators.push(mappedCollaborator);
            });
          }

          const mappedProject: MappedProject = {
            name: repo.name,
            description: readme,
            shortDescription: repo.description,
            uri: repo.html_url,
            collaborators: mappedCollaborators
          };
          return mappedProject;
        })
      );
  }

  /**
   * Method to fetch the repoName & ownerName from a GitHub url.
   * @param url the url to parse.
   */
  private parseNameAndOwnerFromUrl(url: string): { repoName: string, ownerName: string } {
    // Strip off all default github url fragments
    this.githubUrlFragments.forEach(urlFragment => {
      url = StringUtils.stripString(url, urlFragment);
    });

    // String should now be in the following format:
    // owner/repo-name/other-stuff
    const splittedUrl = url.split('/');

    // If there is no result from the split or the result only contains one value return null.
    // Since the result should contains at least two values (repo name & owner).
    if (splittedUrl == null || splittedUrl.length <= 1) {
      return null;
    }

    return {
      ownerName: splittedUrl[0],
      repoName: splittedUrl[1]
    };
  }

  /**
   * Method to fetch the details of a repo.
   * @param repoName Name of the repo.
   * @param ownerName Name of the repo owner.
   */
  private fetchRepo(repoName: string, ownerName: string): Observable<GitHubRepo> {
    const url = `${this.githubApiUrl}/${this.githubReposEndpoint}/${ownerName}/${repoName}`;
    return this.httpClient.get<GitHubRepo>(url).pipe(catchError(error => of(error)));
  }

  /**
   * Method to fetch the colloborators of a repo.
   * @param repoName Name of the repo.
   * @param ownerName Name of the repo owner.
   */
  private fetchCollaborators(repoName: string, ownerName: string): Observable<GitHubContributor[]> {
    const url = `${this.githubApiUrl}/${this.githubReposEndpoint}/${ownerName}/${repoName}/${this.githubCollaboratorsEndpoint}`;
    return this.httpClient.get<GitHubContributor[]>(url).pipe(catchError(error => of(error)));
  }

  /**
   * Method to fetch the readme of a repo.
   * @param repoName Name of the repo.
   * @param ownerName Name of the repo owner.
   * @param defaultBranch Name of the default branch.
   */
  private fetchReadme(repoName: string, ownerName: string, defaultBranch: string): Observable<string> {
    const url = `${this.githubRawContentUrl}/${ownerName}/${repoName}/${defaultBranch}/${this.githubReadme}`;
    return this.httpClient.get(url, { responseType: 'text' }).pipe(catchError(error => of(error)));
  }
}
